$(document).ready(function () {

  "use strict";

  var col;

  QUnit.module("Backbone.PageableCollection - Infinite", {
    beforeEach: function () {
      col = new (Backbone.PageableCollection.extend({
        url: "url"
      }))([
        {id: 1},
        {id: 3},
        {id: 2},
        {id: 4}
      ], {
        state: {
          pageSize: 2,
          currentPage: 2
        },
        mode: "infinite"
      });
    }
  });

  QUnit.test("constructor", function (assert) {
    assert.ok(col.fullCollection instanceof Backbone.Collection);
    assert.strictEqual(col.url, "url");
    assert.strictEqual(col.mode, "infinite");
    assert.strictEqual(col.state.totalRecords, 4);
    assert.deepEqual(col.links, {
      "1": "url",
      "2": "url"
    });
    assert.deepEqual(col.toJSON(), [{id: 2}, {id: 4}]);
    assert.deepEqual(col.fullCollection.toJSON(), [{id: 1}, {id: 3}, {id: 2}, {id: 4}]);

    col = new (Backbone.PageableCollection.extend({
      url: "url"
    }))(null, {
      state: {
        firstPage: 0
      },
      mode: "infinite"
    });

    assert.ok(col.links[0] === "url");
  });

  QUnit.test("parseLinks", function (assert) {
    var xhr = {
      getResponseHeader: function (header) {
        if (header.toLowerCase() == "link") {
          return '<https://api.github.com/user/repos?page=3&per_page=2>; rel="next", <https://api.github.com/user/repos?page=50&per_page=2>; rel="last"';
        }
        return null;
      }
    };

    var links = col.parseLinks({}, {xhr: xhr});

    assert.deepEqual(links, {
      next: "https://api.github.com/user/repos?page=3&per_page=2"
    });

    xhr.getResponseHeader = function () {
      return null;
    };
    links = col.parseLinks({}, {xhr: xhr});
    assert.deepEqual(links, {});
  });

  QUnit.test("#237 url function is called with the right context", function (assert) {
    var col = new (Backbone.PageableCollection.extend({
      name: "name",
      url: function () {
        return "/" + this.name;
      },
      mode: "infinite",
      parseLinks: function () {
        return {};
      }
    }));

    col.getFirstPage();

    assert.strictEqual(this.ajaxSettings.url, "/name");

    this.ajaxSettings.success([{"total_entries": 1}, [{id: 1}]]);
  });

  QUnit.test("fetch", function (assert) {
    assert.expect(3);

    var oldParse = col.parse;
    col.parse = function () {
      assert.ok(true);
      return oldParse.apply(this, arguments);
    };

    col.parseLinks = function () {
      return {first: "url-1", next: "url-2"};
    };

    // makes sure collection events on the current page are not suppressed when
    // refetching the same page
    col.on("all", function (event) {
      if (!_.contains(["request", "sync", "reset", "pageable:state:change"], event)) {
        assert.ok(false);
      }
    });

    col.fetch();

    assert.strictEqual(this.ajaxSettings.url, "url");
    assert.deepEqual(this.ajaxSettings.data, {
      page: 2,
      "per_page": 2
    });

    this.ajaxSettings.success([
      {id: 1},
      {id: 3}
    ]);

    col.parse = oldParse;
  });

  QUnit.test("get*Page", function (assert) {
    assert.expect(53);

    var col = new (Backbone.PageableCollection.extend({
      url: "url"
    }))(null, {
      state: {
        pageSize: 2
      },
      mode: "infinite"
    });

    assert.throws(function () {
      col.getPage("nosuchpage");
    });

    sinon.spy(col, "parse");
    sinon.stub(col, "parseLinks").returns({next: "url2", last: "lastUrl"});

    var currentPageResetEventCount = 0;
    col.on("reset", function () {
      currentPageResetEventCount++;
    });

    var fullCollectionAddEventCount = 0;
    col.fullCollection.on("add", function () {
      fullCollectionAddEventCount++;
    });

    var fullCollectionRemoveEventCount = 0;
    col.fullCollection.on("remove", function () {
      fullCollectionRemoveEventCount++;
    });

    var fullCollectionResetEventCount = 0;
    col.fullCollection.on("reset", function () {
      fullCollectionResetEventCount++;
    });

    // test paging in the first page gets a page full of models and a link for
    // the next page
    col.getFirstPage({success: function () {
      assert.strictEqual(col.state.currentPage, col.state.firstPage);
      assert.strictEqual(col.state.totalRecords, 2);
      assert.strictEqual(col.state.totalPages, 1);
      assert.strictEqual(col.state.lastPage, 1);
      assert.strictEqual(col.fullCollection.length, 2);
      assert.deepEqual(col.links, {
        "1": "url",
        "2": "url2"
      });
      assert.deepEqual(col.toJSON(), [{id: 2}, {id: 1}]);
      assert.deepEqual(col.fullCollection.toJSON(), [{id: 2}, {id: 1}]);
    }});
    this.ajaxSettings.success([
      {id: 2},
      {id: 1}
    ]);
    assert.equal(currentPageResetEventCount, 1);
    assert.equal(fullCollectionAddEventCount, 2);
    assert.equal(fullCollectionRemoveEventCount, 0);
    assert.equal(fullCollectionResetEventCount, 0);
    assert.equal(col.parse.callCount, 1);
    currentPageResetEventCount = 0;
    fullCollectionAddEventCount = 0;
    fullCollectionRemoveEventCount = 0;
    fullCollectionResetEventCount = 0;
    col.parse.resetHistory();
    col.parseLinks.resetHistory();

    // test paging for a page that has a link but no models results in a fetch
    col.parseLinks.returns({next: "url3"});
    col.getNextPage({success: function () {
      assert.strictEqual(col.state.currentPage, 2);
      assert.strictEqual(col.state.totalRecords, 4);
      assert.strictEqual(col.state.totalPages, 2);
      assert.strictEqual(col.state.lastPage, 2);
      assert.strictEqual(col.fullCollection.length, 4);
      assert.deepEqual(col.links, {
        "1": "url",
        "2": "url2",
        "3": "url3"
      });
      assert.deepEqual(col.toJSON(), [{id: 3}, {id: 4}]);
      assert.deepEqual(col.fullCollection.toJSON(), [{id: 2}, {id: 1}, {id: 3}, {id: 4}]);
    }});
    this.ajaxSettings.success([
      {id: 3},
      {id: 4}
    ]);
    assert.equal(currentPageResetEventCount, 1);
    assert.equal(fullCollectionAddEventCount, 2);
    assert.equal(fullCollectionRemoveEventCount, 0);
    assert.equal(fullCollectionResetEventCount, 0);
    assert.equal(col.parse.callCount, 1);
    currentPageResetEventCount = 0;
    fullCollectionAddEventCount = 0;
    fullCollectionRemoveEventCount = 0;
    fullCollectionResetEventCount = 0;
    col.parse.resetHistory();
    col.parseLinks.resetHistory();

    // test paging backward use cache
    col.getPreviousPage();
    assert.strictEqual(col.parseLinks.called, false);
    assert.strictEqual(col.state.currentPage, 1);
    assert.strictEqual(col.state.totalRecords, 4);
    assert.strictEqual(col.state.totalPages, 2);
    assert.strictEqual(col.state.lastPage, 2);
    assert.strictEqual(col.fullCollection.length, 4);
    assert.deepEqual(col.links, {
      "1": "url",
      "2": "url2",
      "3": "url3"
    });
    assert.deepEqual(col.toJSON(), [{id: 2}, {id: 1}]);
    assert.deepEqual(col.fullCollection.toJSON(), [{id: 2}, {id: 1}, {id: 3}, {id: 4}]);
    assert.equal(currentPageResetEventCount, 1);
    assert.equal(fullCollectionAddEventCount, 0);
    assert.equal(fullCollectionRemoveEventCount, 0);
    assert.equal(fullCollectionResetEventCount, 0);
    currentPageResetEventCount = 0;

    // test paging to last page
    col.getLastPage();
    assert.strictEqual(col.parseLinks.called, false);
    assert.strictEqual(col.state.currentPage, 2);
    assert.strictEqual(col.state.totalRecords, 4);
    assert.strictEqual(col.state.totalPages, 2);
    assert.strictEqual(col.state.lastPage, 2);
    assert.strictEqual(col.fullCollection.length, 4);
    assert.deepEqual(col.links, {
      "1": "url",
      "2": "url2",
      "3": "url3"
    });
    assert.deepEqual(col.toJSON(), [{id: 3}, {id: 4}]);
    assert.deepEqual(col.fullCollection.toJSON(), [{id: 2}, {id: 1}, {id: 3}, {id: 4}]);
    assert.equal(currentPageResetEventCount, 1);
    assert.equal(fullCollectionAddEventCount, 0);
    assert.equal(fullCollectionRemoveEventCount, 0);
    assert.equal(fullCollectionResetEventCount, 0);

    col.parseLinks.restore();
  });

  QUnit.test("hasNextPage and hasPreviousPage", function (assert) {
    var col = new (Backbone.PageableCollection.extend({
      url: "url"
    }))([
      {id: 1},
      {id: 2},
      {id: 3}
    ], {
      state: {
        pageSize: 1
      },
      mode: "infinite"
    });

    assert.strictEqual(col.hasPreviousPage(), false);
    assert.strictEqual(col.hasNextPage(), true);

    col.getNextPage();

    assert.strictEqual(col.hasPreviousPage(), true);
    assert.strictEqual(col.hasNextPage(), true);

    col.getLastPage();

    assert.strictEqual(col.hasPreviousPage(), true);
    assert.strictEqual(col.hasNextPage(), false);
  });

});

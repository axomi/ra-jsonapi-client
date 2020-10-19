'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * A map-like class that maps resource linkage objects {id: 1, type: "user"} to concrete resources with attributes and
 * relationships
 */
var ResourceLookup = function () {

  /**
   * Constructs a new lookup map
   * @param {Object} response A JSON API response, in JSON format
   */
  function ResourceLookup(response) {
    _classCallCheck(this, ResourceLookup);

    this.lookup = new Map();

    // If the response wasn't a JSON dictionary, we can't and don't need to build a lookup
    if ((typeof response === 'undefined' ? 'undefined' : _typeof(response)) !== 'object') return;

    var resources = void 0;
    if (response.hasOwnProperty('included')) {
      resources = [response.data].concat(_toConsumableArray(response.included));
    } else {
      resources = [response.data];
    }

    // Iterate over each resource returned and put each in the lookup
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = resources[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var entry = _step.value;

        var key = this.getKey(entry);
        this.lookup.set(key, entry);
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }
  }

  /**
   * Calculates a hashable key for JSON API resources
   * @param resource A resource linkage object
   * @returns {string}
   */


  _createClass(ResourceLookup, [{
    key: 'getKey',
    value: function getKey(resource) {
      return resource.type + ':' + resource.id;
    }

    /**
     * Looks up a resource
     * @param resource A resource linkage object
     * @returns {Object}
     */

  }, {
    key: 'get',
    value: function get(resource) {
      // If we don't have included data for this resource, just return the Resource Linkage object, since that's still
      // useful
      if (this.has(resource)) {
        return this.lookup.get(this.getKey(resource));
      } else {
        return resource;
      }
    }

    /**
     * Returns true if the resource is in the lookup
     * @param resource
     * @returns {boolean}
     */

  }, {
    key: 'has',
    value: function has(resource) {
      return this.lookup.has(this.getKey(resource));
    }

    /**
     * Converts a JSON API data object (with id, type, and attributes fields) into a flattened object
     * @param {Object} response A JSON API data object
     */

  }, {
    key: 'unwrapData',
    value: function unwrapData(response) {
      var _this = this;

      // The base resource object
      var ret = Object.assign({
        id: response.id
      }, response.attributes);

      // Deal with relationships
      if (response.hasOwnProperty('relationships')) {
        ret.relationships = {};
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = Object.entries(response.relationships)[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var _ref = _step2.value;

            var _ref2 = _slicedToArray(_ref, 2);

            var relationName = _ref2[0];
            var relation = _ref2[1];

            if (relation.hasOwnProperty('data')) {
              if (Array.isArray(relation)) {
                ret.relationships[relationName] = relation.data.map(function (resource) {
                  return _this.unwrapData(_this.get(resource));
                });
              } else {
                ret.relationships[relationName] = this.unwrapData(this.get(relation.data));
              }
            }
          }
        } catch (err) {
          _didIteratorError2 = true;
          _iteratorError2 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
              _iterator2.return();
            }
          } finally {
            if (_didIteratorError2) {
              throw _iteratorError2;
            }
          }
        }
      }

      return ret;
    }
  }]);

  return ResourceLookup;
}();

exports.default = ResourceLookup;
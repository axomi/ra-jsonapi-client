'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSettings = exports.defaultSettings = undefined;

var _qs = require('qs');

var _deepmerge = require('deepmerge');

var _deepmerge2 = _interopRequireDefault(_deepmerge);

var _jsonapiSerializer = require('jsonapi-serializer');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

// Utility to externally merge defaults (for now)
var defaultSettings = exports.defaultSettings = {
  total: 'total',
  updateMethod: 'PATCH',
  arrayFormat: 'brackets',
  serializerOpts: {},
  deserializerOpts: {}
};

var getSettings = exports.getSettings = function getSettings(userSettings) {
  var settings = (0, _deepmerge2.default)(defaultSettings, userSettings);
  settings.headers = new Headers({
    Accept: 'application/vnd.api+json; charset=utf-8',
    'Content-Type': 'application/vnd.api+json; charset=utf-8'
  });

  return settings;
};

var processTotal = function processTotal(settings, json) {
  // Do some validation of the total parameter if a list was requested
  var total = void 0;

  if (settings.total === null) {
    // If the user explicitly provided no total field, then just count the number of objects returned
    total = json.data.length;
  } else if ('meta' in json && settings.total in json.meta) {
    // If the user specified a count field, and it's present, then just use that
    total = json.meta[settings.total];
  } else if (!('meta' in json) || !(settings.total in json.meta)) {
    // The third option: the server doesn't return a total property at all, so we have to throw an exception
    throw new Error('The JSON API response did not contain the field "' + settings.total + '" in the meta object.\n    Consider either setting the "total" setting to null for default behaviour, changing the "total" setting to\n    point to the correct meta field, or ensuring your JSON API server is actually returned a "total" meta\n    property.');
  }

  return total;
};

/** This proxy ensures that every relationship is serialized to an object of the form {id: x}, even
 * if that relationship doesn't have included data
 */
var specialOpts = ['transform', 'keyForAttribute', 'id', 'typeAsAttribute', 'links'];
var relationshipProxyHandler = {
  has: function has(target, key) {
    // Pretend to have all keys except certain ones with special meanings
    if (specialOpts.includes(key)) {
      return key in target;
    }
    return true;
  },
  get: function get(target, key) {
    var fallback = target[key];

    // Use the fallback for special options
    if (specialOpts.includes(key)) {
      return fallback;
    }

    // Merge the fallback with this object for per-resource settings
    return Object.assign({
      valueForRelationship: function valueForRelationship(data, included) {
        // If we have actual included data use it, but otherwise just return the id in an object
        if (included) {
          return included;
        }

        return { id: data.id };
      }
    }, fallback || {});
  }
};

var getSerializerOpts = function getSerializerOpts(settings, resource, params) {
  var resourceSpecific = settings.serializerOpts[resource] || {};

  // By default, assume the user wants to serialize all keys except links, in case that's
  // a leftover from a deserialized resource
  var attributes = new Set(Object.keys(params.data));
  attributes.delete('links');

  return Object.assign({
    attributes: [].concat(_toConsumableArray(attributes))
  }, resourceSpecific);
};

/**
 * Maps react-admin queries to a JSONAPI REST API
 *
 * @param {string} apiUrl the base URL for the JSONAPI
 * @param {Object} userSettings Settings to configure this client.
 *
 * @param {string} type Request type, e.g GET_LIST
 * @param {string} resource Resource name, e.g. "posts"
 * @param {Object} payload Request parameters. Depends on the request type
 * @returns {Promise} the Promise for a data response
 */

exports.default = function (apiUrl) {
  var settings = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var httpClient = arguments[2];
  return {
    getList: function getList(resource, params) {
      var _params$pagination = params.pagination,
          page = _params$pagination.page,
          perPage = _params$pagination.perPage;

      // Create query with pagination params.

      var query = {
        'page[number]': page,
        'page[size]': perPage
      };

      // Add all filter params to query.
      Object.keys(params.filter || {}).forEach(function (key) {
        query['filter[' + key + ']'] = params.filter[key];
      });

      // Add sort parameter
      if (params.sort && params.sort.field) {
        var prefix = params.sort.order === 'ASC' ? '' : '-';
        query.sort = '' + prefix + params.sort.field;
      }
      var url = apiUrl + '/' + resource + '?' + (0, _qs.stringify)(query);

      return httpClient(url).then(function (_ref) {
        var json = _ref.json;

        var opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

        // Use the length of the data array as a fallback.
        var total = json.data.length;
        if (json.meta && settings.total) {
          total = json.meta[settings.total];
        }

        return new _jsonapiSerializer.Deserializer(opts).deserialize(json).then(function (data) {
          return { data: data, total: total };
        });
      });
    },
    getOne: function getOne(resource, params) {
      var url = apiUrl + '/' + resource + '/' + params.id;
      return httpClient(url).then(function (_ref2) {
        var json = _ref2.json;

        var opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

        return new _jsonapiSerializer.Deserializer(opts).deserialize(json).then(function (data) {
          return { data: data };
        });
      });
    },
    getMany: function getMany(resource, params) {
      var query = (0, _qs.stringify)({
        'filter[id]': params.ids
      }, { arrayFormat: settings.arrayFormat });
      var url = apiUrl + '/' + resource + '?' + (0, _qs.stringify)(query);

      return httpClient(url).then(function (_ref3) {
        var json = _ref3.json;

        var opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

        // Use the length of the data array as a fallback.
        var total = json.data.length;
        if (json.meta && settings.total) {
          total = json.meta[settings.total];
        }

        return new _jsonapiSerializer.Deserializer(opts).deserialize(json).then(function (data) {
          return { data: data, total: total };
        });
      });
    },
    getManyReference: function getManyReference(resource, params) {
      var _params$pagination2 = params.pagination,
          page = _params$pagination2.page,
          perPage = _params$pagination2.perPage;

      // Create query with pagination params.

      var query = {
        'page[number]': page,
        'page[size]': perPage
      };

      // Add all filter params to query.
      Object.keys(params.filter || {}).forEach(function (key) {
        query['filter[' + key + ']'] = params.filter[key];
      });

      // Add the reference id to the filter params.
      query['filter[' + params.target + ']'] = params.id;

      var url = apiUrl + '/' + resource + '?' + (0, _qs.stringify)(query);

      return httpClient(url).then(function (_ref4) {
        var json = _ref4.json;

        var opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

        // Use the length of the data array as a fallback.
        var total = json.data.length;
        if (json.meta && settings.total) {
          total = json.meta[settings.total];
        }

        return new _jsonapiSerializer.Deserializer(opts).deserialize(json).then(function (data) {
          return { data: data, total: total };
        });
      });
    },
    update: function update(resource, params) {
      var url = apiUrl + '/' + resource + '/' + params.id;
      var data = Object.assign({ id: params.id }, params.data);
      var options = {
        method: settings.updateMethod
      };
      options.body = JSON.stringify(new _jsonapiSerializer.Serializer(resource, getSerializerOpts(settings, resource, params)).serialize(data));

      return httpClient(url, options).then(function (_ref5) {
        var json = _ref5.json;

        var opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

        return new _jsonapiSerializer.Deserializer(opts).deserialize(json).then(function (data) {
          return { data: data };
        });
      });
    },
    updateMany: function updateMany(resource, params) {
      Promise.all(params.ids.map(function (id) {
        return undefined.update(resource, params);
      })).then(function (responses) {
        return { data: responses.map(function (_ref6) {
            var json = _ref6.json;
            return json.id;
          }) };
      });
    },
    create: function create(resource, params) {
      var url = apiUrl + '/' + resource;
      var options = { method: 'POST' };
      options.body = JSON.stringify(new _jsonapiSerializer.Serializer(resource, getSerializerOpts(settings, resource, params)).serialize(params.data));

      return httpClient(url, options).then(function (_ref7) {
        var json = _ref7.json;

        var opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

        return new _jsonapiSerializer.Deserializer(opts).deserialize(json).then(function (data) {
          return { data: data };
        });
      });
    },
    delete: function _delete(resource, params) {
      var url = apiUrl + '/' + resource + '/' + params.id;
      var options = {
        method: 'DELETE'
      };

      return httpClient(url, options).then(function (_ref8) {
        var json = _ref8.json;

        return Promise.resolve({
          data: {
            id: params.id
          }
        });
      });
    },
    deleteMany: function deleteMany(resource, params) {
      return Promise.all(params.ids.map(function (id) {
        undefined.delete(resource, { id: id });
      })).then(function (responses) {
        return { data: responses.map(function (_ref9) {
            var json = _ref9.json;
            return json.id;
          }) };
      });
    }
  };
};
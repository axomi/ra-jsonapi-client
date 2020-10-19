'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _qs = require('qs');

var _deepmerge = require('deepmerge');

var _deepmerge2 = _interopRequireDefault(_deepmerge);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _actions = require('./actions');

var _defaultSettings = require('./default-settings');

var _defaultSettings2 = _interopRequireDefault(_defaultSettings);

var _errors = require('./errors');

var _resourceLookup = require('./resourceLookup');

var _resourceLookup2 = _interopRequireDefault(_resourceLookup);

var _initializer = require('./initializer');

var _initializer2 = _interopRequireDefault(_initializer);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Set HTTP interceptors.
(0, _initializer2.default)();

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
  var userSettings = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  return function (type, resource, params) {
    var url = '';
    var settings = (0, _deepmerge2.default)(_defaultSettings2.default, userSettings);

    var options = {
      headers: settings.headers
    };

    switch (type) {
      case _actions.GET_LIST:
        {
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

          url = apiUrl + '/' + resource + '?' + (0, _qs.stringify)(query);
          break;
        }

      case _actions.GET_ONE:
        url = apiUrl + '/' + resource + '/' + params.id;
        break;

      case _actions.CREATE:
        url = apiUrl + '/' + resource;
        options.method = 'POST';
        options.data = JSON.stringify({
          data: { type: resource, attributes: params.data }
        });
        break;

      case _actions.UPDATE:
        {
          url = apiUrl + '/' + resource + '/' + params.id;

          var data = {
            data: {
              id: params.id,
              type: resource,
              attributes: params.data
            }
          };

          options.method = settings.updateMethod;
          options.data = JSON.stringify(data);
          break;
        }

      case _actions.DELETE:
        url = apiUrl + '/' + resource + '/' + params.id;
        options.method = 'DELETE';
        break;

      case _actions.GET_MANY:
        {
          var _query = {
            filter: JSON.stringify({ id: params.ids })
          };
          url = apiUrl + '/' + resource + '?' + (0, _qs.stringify)(_query);
          break;
        }

      case _actions.GET_MANY_REFERENCE:
        {
          var _params$pagination2 = params.pagination,
              _page = _params$pagination2.page,
              _perPage = _params$pagination2.perPage;

          // Create query with pagination params.

          var _query2 = {
            'page[number]': _page,
            'page[size]': _perPage
          };

          // Add all filter params to query.
          Object.keys(params.filter || {}).forEach(function (key) {
            _query2['filter[' + key + ']'] = params.filter[key];
          });

          // Add the reference id to the filter params.
          _query2['filter[' + params.target + ']'] = params.id;

          url = apiUrl + '/' + resource + '?' + (0, _qs.stringify)(_query2);
          break;
        }

      default:
        throw new _errors.NotImplementedError('Unsupported Data Provider request type ' + type);
    }

    return (0, _axios2.default)(_extends({ url: url }, options)).then(function (response) {
      var lookup = new _resourceLookup2.default(response.data);

      // Do some validation of the total parameter if a list was requested
      var total = void 0;
      if ([_actions.GET_LIST, _actions.GET_MANY, _actions.GET_MANY_REFERENCE].includes(type)) {
        if (settings.total === null) {
          // If the user explicitly provided no total field, then just count the number of objects returned
          total = response.data.data.length;
        } else if ('meta' in response.data && settings.total in response.data.meta) {
          // If the user specified a count field, and it's present, then just use that
          total = response.data.meta[settings.total];
        } else if (!('meta' in response.data) || !(settings.total in response.data.meta)) {
          // The third option: the server doesn't return a total property at all, so we have to throw an exception
          throw new Error('The JSON API response did not contain the field "' + settings.total + '" in the meta object.\n          Consider either setting the "total" setting to null for default behaviour, changing the "total" setting to \n          point to the correct meta field, or ensuring your JSON API server is actually returned a "total" meta\n          property.');
        }
      }

      switch (type) {
        case _actions.GET_MANY:
        case _actions.GET_MANY_REFERENCE:
        case _actions.GET_LIST:
          return {
            data: response.data.data.map(function (resource) {
              return lookup.unwrapData(resource);
            }),
            total: total
          };

        case _actions.GET_ONE:
        case _actions.CREATE:
        case _actions.UPDATE:
          return {
            data: lookup.unwrapData(response.data.data)
          };

        case _actions.DELETE:
          {
            return {
              data: { id: params.id }
            };
          }

        default:
          throw new _errors.NotImplementedError('Unsupported Data Provider request type ' + type);
      }
    });
  };
};
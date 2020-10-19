import { stringify } from 'qs';
import merge from 'deepmerge';
import axios from 'axios';
import {
  GET_LIST,
  GET_ONE,
  CREATE,
  UPDATE,
  DELETE,
  GET_MANY,
  GET_MANY_REFERENCE,
} from './actions';

import defaultSettings from './default-settings';
import { NotImplementedError } from './errors';
import ResourceLookup from './resourceLookup';
import init from './initializer';

/** This proxy ensures that every relationship is serialized to an object of the form {id: x}, even
 * if that relationship doesn't have included data
 */
const specialOpts = ['transform', 'keyForAttribute', 'id', 'typeAsAttribute', 'links'];
const relationshipProxyHandler = {
  has(target, key) {
    // Pretend to have all keys except certain ones with special meanings
    if (specialOpts.includes(key)) {
      return key in target;
    }
    return true;
  },
  get(target, key) {
    const fallback = target[key];

    // Use the fallback for special options
    if (specialOpts.includes(key)) {
      return fallback;
    }

    // Merge the fallback with this object for per-resource settings
    return Object.assign({
      valueForRelationship(data, included) {
        // If we have actual included data use it, but otherwise just return the id in an object
        if (included) {
          return included;
        }

        return { id: data.id };
      },
    }, fallback || {});
  },
};

// Set HTTP interceptors.
init();

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
export default (apiUrl, userSettings = {}) => (type, resource, params) => {
  let url = '';
  const settings = merge(defaultSettings, userSettings);

  const options = {
    headers: settings.headers,
  };

  function getSerializerOpts() {
    const resourceSpecific = settings.serializerOpts[resource] || {};

    // By default, assume the user wants to serialize all keys except links, in case that's
    // a leftover from a deserialized resource
    const attributes = new Set(Object.keys(params.data));
    attributes.delete('links');

    return Object.assign({
      attributes: [...attributes],
    }, resourceSpecific);
  }

  switch (type) {
    case GET_LIST: {
      const { page, perPage } = params.pagination;

      // Create query with pagination params.
      const query = {
        'page[number]': page,
        'page[size]': perPage,
      };

      // Add all filter params to query.
      Object.keys(params.filter || {}).forEach((key) => {
        query[`filter[${key}]`] = params.filter[key];
      });

      // Add sort parameter
      if (params.sort && params.sort.field) {
        const prefix = params.sort.order === 'ASC' ? '' : '-';
        query.sort = `${prefix}${params.sort.field}`;
      }

      url = `${apiUrl}/${resource}?${stringify(query)}`;
      break;
    }

    case GET_ONE:
      url = `${apiUrl}/${resource}/${params.id}`;
      break;

    case CREATE:
      url = `${apiUrl}/${resource}`;
      options.method = 'POST';
      options.data = JSON.stringify({
        data: { type: resource, attributes: params.data },
      });
      break;

    case UPDATE: {
      url = `${apiUrl}/${resource}/${params.id}`;

      const data = {
        data: {
          id: params.id,
          type: resource,
          attributes: params.data,
        },
      };

      options.method = settings.updateMethod;
      options.data = JSON.stringify(data);
      break;
    }

    case DELETE:
      url = `${apiUrl}/${resource}/${params.id}`;
      options.method = 'DELETE';
      break;

    case GET_MANY: {
      const query = {
        filter: JSON.stringify({ id: params.ids }),
      };
      url = `${apiUrl}/${resource}?${stringify(query)}`;
      break;
    }

    case GET_MANY_REFERENCE: {
      const { page, perPage } = params.pagination;

      // Create query with pagination params.
      const query = {
        'page[number]': page,
        'page[size]': perPage,
      };

      // Add all filter params to query.
      Object.keys(params.filter || {}).forEach((key) => {
        query[`filter[${key}]`] = params.filter[key];
      });

      // Add the reference id to the filter params.
      query[`filter[${params.target}]`] = params.id;

      url = `${apiUrl}/${resource}?${stringify(query)}`;
      break;
    }

    default:
      throw new NotImplementedError(`Unsupported Data Provider request type ${type}`);
  }

  return axios({ url, ...options })
    .then((response) => {
      const lookup = new ResourceLookup(response.data);

      // Do some validation of the total parameter if a list was requested
      let total;
      if ([ GET_LIST, GET_MANY, GET_MANY_REFERENCE ].includes(type)) {
        if (settings.total === null) {
          // If the user explicitly provided no total field, then just count the number of objects returned
          total = response.data.data.length;
        } else if ('meta' in response.data && settings.total in response.data.meta) {
          // If the user specified a count field, and it's present, then just use that
          total = response.data.meta[settings.total];
        } else if (!('meta' in response.data) || !(settings.total in response.data.meta)) {
          // The third option: the server doesn't return a total property at all, so we have to throw an exception
          throw new Error(`The JSON API response did not contain the field "${settings.total}" in the meta object.
          Consider either setting the "total" setting to null for default behaviour, changing the "total" setting to
          point to the correct meta field, or ensuring your JSON API server is actually returned a "total" meta
          property.`);
        }
      }

      switch (type) {
        case GET_MANY:
        case GET_MANY_REFERENCE:
        case GET_LIST:
          return {
            data: response.data.data.map(resource => lookup.unwrapData(resource)),
            total,
          };

        case GET_ONE:
        case CREATE:
        case UPDATE:
          return {
            data: lookup.unwrapData(response.data.data),
          };

        case DELETE: {
          return {
            data: { id: params.id },
          };
        }

        default:
          throw new NotImplementedError(`Unsupported Data Provider request type ${type}`);
      }
    });
};

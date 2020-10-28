import { stringify } from 'qs';
import merge from "deepmerge"
import { Deserializer, Serializer } from 'jsonapi-serializer';

// Utility to externally merge defaults (for now)
export const defaultSettings = {
  total: 'total',
  updateMethod: 'PATCH',
  arrayFormat: 'brackets',
  serializerOpts: {},
  deserializerOpts: {},
};

export const getSettings = (userSettings) => {
  const settings = merge(defaultSettings, userSettings);
  settings.headers = new Headers({
    Accept: 'application/vnd.api+json; charset=utf-8',
    'Content-Type': 'application/vnd.api+json; charset=utf-8',
  });

  return settings
}

const processTotal = (settings, json) => {
  // Do some validation of the total parameter if a list was requested
  let total;

  if (settings.total === null) {
    // If the user explicitly provided no total field, then just count the number of objects returned
    total = json.data.length;
  } else if ('meta' in json && settings.total in json.meta) {
    // If the user specified a count field, and it's present, then just use that
    total = json.meta[settings.total];
  } else if (!('meta' in json) || !(settings.total in json.meta)) {
    // The third option: the server doesn't return a total property at all, so we have to throw an exception
    throw new Error(`The JSON API response did not contain the field "${settings.total}" in the meta object.
    Consider either setting the "total" setting to null for default behaviour, changing the "total" setting to
    point to the correct meta field, or ensuring your JSON API server is actually returned a "total" meta
    property.`);
  }

  return total;
}

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

const getSerializerOpts = (settings, resource, params) => {
  const resourceSpecific = settings.serializerOpts[resource] || {};

  // By default, assume the user wants to serialize all keys except links, in case that's
  // a leftover from a deserialized resource
  const attributes = new Set(Object.keys(params.data));
  attributes.delete('links');

  return Object.assign({
    attributes: [...attributes],
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
export default (apiUrl, settings = {}, httpClient) => ({
  getList: (resource, params) => {
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
    const url = `${apiUrl}/${resource}?${stringify(query)}`;

    return httpClient(url).then(({json}) => {
      const opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

      // Use the length of the data array as a fallback.
      let total = json.data.length;
      if (json.meta && settings.total) {
        total = json.meta[settings.total];
      }

      return new Deserializer(opts).deserialize(json).then(
        data => ({ data, total }),
      );
    })
  },
  getOne: (resource, params) => {
    const url = `${apiUrl}/${resource}/${params.id}`;
    return httpClient(url).then(({json}) => {
      const opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

      return new Deserializer(opts).deserialize(json).then(
        data => ({ data }),
      );
    })
  },
  getMany: (resource, params) => {
    const query = stringify({
      'filter[id]': params.ids,
    }, { arrayFormat: settings.arrayFormat });
    const url = `${apiUrl}/${resource}?${stringify(query)}`;

    return httpClient(url).then(({json}) => {
      const opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

      // Use the length of the data array as a fallback.
      let total = json.data.length;
      if (json.meta && settings.total) {
        total = json.meta[settings.total];
      }

      return new Deserializer(opts).deserialize(json).then(
        data => ({ data, total }),
      );
    })
  },
  getManyReference: (resource, params) => {
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

    const url = `${apiUrl}/${resource}?${stringify(query)}`;

    return httpClient(url).then(({json}) => {
      const opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

      // Use the length of the data array as a fallback.
      let total = json.data.length;
      if (json.meta && settings.total) {
        total = json.meta[settings.total];
      }

      return new Deserializer(opts).deserialize(json).then(
        data => ({ data, total }),
      );
    })
  },
  update: (resource, params) => {
    const url = `${apiUrl}/${resource}/${params.id}`
    const data = Object.assign({ id: params.id }, params.data);
    const options = {
      method: settings.updateMethod,
    };
    options.body = JSON.stringify(new Serializer(resource, getSerializerOpts(settings, resource, params)).serialize(data));

    return httpClient(url, options).then(({json}) => {
      const opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

      return new Deserializer(opts).deserialize(json).then(
        data => ({ data }),
      );
    })
  },
  updateMany: (resource, params) => {
    Promise.all(
      params.ids.map(id => {
        return this.update(resource, params)
      })
    ).then(responses => ({ data: responses.map(({ json }) => json.id) }))
  },
  create: (resource, params) => {
    const url = `${apiUrl}/${resource}`;
    const options = { method: 'POST' }
    options.body = JSON.stringify(new Serializer(resource, getSerializerOpts(settings, resource, params)).serialize(params.data));

    return httpClient(url, options).then(({json}) => {
      const opts = new Proxy(settings.deserializerOpts[resource] || {}, relationshipProxyHandler);

      return new Deserializer(opts).deserialize(json).then(
        data => ({ data }),
      );
    })
  },
  delete: (resource, params) => {
    const url = `${apiUrl}/${resource}/${params.id}`;
    const options = {
      method: 'DELETE'
    };

    return httpClient(url, options).then(({json}) => {
      return Promise.resolve({
        data: {
          id: params.id,
        },
      });
    })
  },
  deleteMany: (resource, params) => {
    return Promise.all(
      params.ids.map(id => {
        this.delete(resource, { id })
      })
  ).then(responses =>
    ({ data: responses.map(({ json }) => json.id) }))
  }
})

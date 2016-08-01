/* eslint no-case-declarations: 0 */

import isEqual from 'lodash.isequal'
import {
  FETCH, FETCH_SUCCESS, FETCH_ERROR,
  FETCH_ONE, FETCH_ONE_SUCCESS, FETCH_ONE_ERROR,
  CREATE, CREATE_SUCCESS, CREATE_ERROR,
  UPDATE, UPDATE_SUCCESS, UPDATE_ERROR,
  DELETE, DELETE_SUCCESS, DELETE_ERROR,
  CLEAR_ACTION_STATUS, API_CALL, GARBAGE_COLLECT,
  CLEAR_MODEL_DATA
} from './actionTypes'

/*
 * SECTION: initial states
 */

const byIdInitialState = {}

const collectionInitialState = {
  params: {},
  otherInfo: {},
  ids: [],
  fetchTime: null,
  error: null
}

const collectionsInitialState = []

const actionStatusInitialState = {
  create: {},
  update: {},
  delete: {}
}

const modelInitialState = {
  byId: byIdInitialState,
  collections: collectionsInitialState,
  actionStatus: actionStatusInitialState
}

// holds a number of models, each of which are strucured like modelInitialState
const initialState = {}

/*
 * SECTION: Helpers
 */

const updateIn(obj, keys, updater, notSetValue) {
  if (keys.length === 0) {
    throw new Error('updateIn needs at least one key')
  }
  if (keys.length === 1) {
    const key = keys[0]
    const newValue = obj.key ? updater(obj[key]) : notSetValue
    return Object.assign({}, obj, {
      [key]: newValue
    })
  }
  const key = keys[0]
  return Object.assign({}, obj, {
    [key]: updateIn(obj, keys.slice(1), updater)
  })
}

/*
 * SECTION: reducers
 */

// server data is canonical, so blast away the old data
function byIdReducer(state = byIdInitialState, action) {
  const id = action.meta ? action.meta.id : undefined
  const newState = Object.assign({}, state)
  switch (action.type) {
    case FETCH_SUCCESS:
      const data = state
      const payload = ('data' in action.payload) ? action.payload.data : action.payload
      action.payload.data.forEach((record) => {
        newState[record.id] = {
          record,
          fetchTime: action.meta.fetchTime,
          error: null
        }
      })
      return newState
    case FETCH_ONE:
      newState[id.toString()] = {
        fetchTime: 0,
        error: null,
        record: null
      }
      return newState
    case FETCH_ONE_SUCCESS:
      newState[id.toString()] = {
        fetchTime: action.meta.fetchTime,
        error: null,
        record: action.payload
      }
      return newState
    case FETCH_ONE_ERROR:
      newState[id.toString()] = {
        fetchTime: action.meta.fetchTime,
        error: action.payload,
        record: null
      }
      return newState
    case CREATE_SUCCESS:
      newState[action.payload.id.toString()] = {
        record: action.payload,
        fetchTime: action.meta.fetchTime,
        error: null
      }
      return newState
    case UPDATE:
      return state // don't change fetchTime, or it'll invalidate collections
    case UPDATE_SUCCESS:
      newState[id.toString()] = {
        record: action.payload,
        fetchTime: action.meta.fetchTime,
        error: null
      }
      return newState
    case DELETE_SUCCESS:
      delete newState[id.toString()]
      return newState
    default:
      return state
  }
}

/*
 * Note: fetchTime of null means "needs fetch"
 */
function collectionReducer(state = collectionInitialState, action) {
  const newState = Object.assign(state, {})
  switch (action.type) {
    case FETCH:
      newState.params = action.meta.params
      newState.fetchTime = 0
      newState.error = null
      return newState
    case FETCH_SUCCESS:
      const originalPayload = action.payload || {}
      const payload = ('data' in originalPayload) ? action.payload.data : action.payload
      const otherInfo = ('data' in originalPayload) ? originalPayload : {}
      const ids = payload.map((elt) => elt.id)

      newState.params = action.meta.params
      newState.ids = payload.map(elt => elt.id)
      newState.otherInfo = {}
      Object.keys(otherInfo).forEach(key => {
        return if key === 'data'
        newState.otherInfo[key] = otherInfo[key]
      })
      newState.error = null
      newState.fetchTime = action.meta.fetchTime
      return newState
    case FETCH_ERROR:
      newState.params = action.meta.params
      newState.error = action.payload
      return newState
    default:
      return state
  }
}

function collectionsReducer(state = collectionsInitialState, action) {
  const newState = Object.assign({}, state)
  switch (action.type) {
    case FETCH:
    case FETCH_SUCCESS:
    case FETCH_ERROR:
      if (action.meta.params === undefined) {
        return state
      }

      let indexOfCollection = null
      for (let index in state) {
        const collection = state[index]
        if (isEqual(collection.params, action.meta.params)) {
          indexOfCollection = index
          break
        }
      }

      if (indexOfCollection === null) {
        return newState.push(collectionReducer(undefined, action))
      } else {
        newState[indexOfCollection] = collectionReducer(newState[indexOfCollection])
        return newState
      }
    case CREATE_SUCCESS:
    case DELETE_SUCCESS:
      // set fetchTime on all entries to null
      return state.map(item => (
        Object.assign({}, item, { fetchTime: null })
      ))
    case GARBAGE_COLLECT:
      const tenMinutesAgo = action.meta.now - 10 * 60 * 1000
      const cleanState = {}
      Object.keys(state).forEach(key => {
        if (state[key]['fetchTime'] === null ||
            state[key]['fetchTime'] > tenMinutesAgo) {
          cleanState[key] = state[key]
        }
      })
      return cleanState
    default:
      return state
  }
}

function actionStatusReducer(state = actionStatusInitialState, action) {
  const newState = Object.assign({}, state)
  switch (action.type) {
    case CLEAR_ACTION_STATUS:
      newState[action.payload.action] = {}
      return newState
    case CREATE:
      newState['create'] = {
        pending: true,
        id: null
      }
      return newState
    case CREATE_SUCCESS:
    case CREATE_ERROR:
      newState['create'] = {
        pending: false,
        id: action.payload.id,
        isSuccess: !action.error,
        payload: action.payload
      }
      return newState
    case UPDATE:
      newState['update'] = {
        pending: true,
        id: action.meta.id
      }
      return newState
    case UPDATE_SUCCESS:
    case UPDATE_ERROR:
      newState['update'] = {
        pending: false,
        id: action.meta.id,
        isSuccess: !action.error,
        payload: action.payload
      }
      return newState
    case DELETE:
      newState['delete'] = {
        pending: true,
        id: action.meta.id
      }
      return newState
    case DELETE_SUCCESS:
    case DELETE_ERROR:
      newState['delete'] = {
        pending: false,
        id: action.meta.id,
        isSuccess: !action.error,
        payload: action.payload // probably null...
      }
      return newState
    default:
      return state
  }
}

export default function crudReducer(state = initialState, action) {
  const id = action.meta ? action.meta.id : undefined
  switch (action.type) {
    case CLEAR_MODEL_DATA:
      newState[action.payload.model] = modelInitialState
      return newState
    case CLEAR_ACTION_STATUS:
      return updateIn(state, [action.payload.model, 'actionStatus'],
                      (s) => actionStatusReducer(s, action))
    case GARBAGE_COLLECT:
      return state.map(model => {
        const newState = Object.assign({}, model)
        newState.collections = collectionsReducer(newState.collections, action)
        newState.byId = byIdReducer(newState.byId, action)
        return newState
      })
    case FETCH:
    case FETCH_SUCCESS:
    case FETCH_ERROR:
      let newState = Object.assign({}, state)
      newState = updateIn(newState, [action.meta.model, 'collections'],
                              (s) => collectionsReducer(s, action))
      newState = updateIn(newState, [action.meta.model, 'byId'],
                          (s) => byIdReducer(s, action))
      return newState
    case FETCH_ONE:
    case FETCH_ONE_SUCCESS:
    case FETCH_ONE_ERROR:
      return updateIn(state, [action.meta.model, 'byId'], 
                      (s) => byIdReducer(s, action))
    case CREATE:
      return updateIn(state, [action.meta.model, 'actionStatus'],
                      (s) => actionStatusReducer(s, action))
    case CREATE_SUCCESS:
      let newState = Object.assign({}, state)
      newState = updateIn(newState, [action.meta.model, 'byId'],
                              (s) => byIdReducer(s, action))
      newState = updateIn(newState, [action.meta.model, 'collections'],
                          (s) => collectionsReducer(s, action),
                          collectionsInitialState)
      newState = updateIn(newState, [action.meta.model, 'actionStatus'],
                          (s) => actionStatuReducer(s, action))
      return newState
    case CREATE_ERROR:
      return updateIn(newState, [action.meta.model, 'actionStatus'],
                      (s) => actionStatusReducer(s, action))
    case UPDATE:
    case UPDATE_SUCCESS:
    case UPDATE_ERROR:
      let newState = Object.assign({}, state)
      newState = updateIn(newState, [action.meta.model, 'byId'],
                              (s) => byIdReducer(s, action))
      newState = updateIn(newState, [action.meta.model, 'actionStatus'],
                          (s) => actionStatusReducer(s, action))
      return newState
    case DELETE:
    case DELETE_SUCCESS:
    case DELETE_ERROR:
      let newState = Object.assign({}, state)
      newState = updateIn(newState, [action.meta.model, 'byId'],
                              (s) => byIdReducer(s, action))
      newState = updateIn(newState, [action.meta.model, 'collections'],
                          (s) => collectionsReducer(s, action),
                          collectionsInitialState)
      newState = updateIn(newState, [action.meta.model, 'actionStatus'],
                          (s) => actionStatusReducer(s, action))
      return newState
    default:
      return state
  }
}

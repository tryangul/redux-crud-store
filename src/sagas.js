/* @flow */
/* global Generator */

import { takeEvery } from 'redux-saga'
import { fork, put, call } from 'redux-saga/effects'
import { get as lodashGet } from 'lodash'

import {
  FETCH, FETCH_ONE, CREATE, UPDATE, DELETE, API_CALL, GARBAGE_COLLECT
} from './actionTypes'

// TODO: The `Effect` type is not actually defined. Because 'redux-saga' does
// not use @flow annotations, flow pretends that this import succeeds.
import type { Effect } from 'redux-saga'
import type { CrudAction } from './actionTypes'

// Generator type parameters are: Generator<+Yield,+Return,-Next>

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function* garbageCollector() {
  yield call(delay, 10 * 60 * 1000) // initial 10 minute delay
  for (;;) {
    yield call(delay, 5 * 60 * 1000) // every 5 minutes thereafter
    yield put({ type: GARBAGE_COLLECT, meta: { now: Date.now() } })
  }
}

const crudNormalize = ([response, headers], action, meta) => {
  const { model, schema } = action.meta
  const { params } = action.payload

  const normalized = normalize(response, schema).entities
  const envelope = lodashGet(normalized, ['envelope', 'undefined'])
  const ids = Object.keys(normalized[model])
  const byId = normalized[model]

  return {
    type: action.meta.success,
    meta,
    payload: {
      byId,
      collection: {
        envelope,
        headers,
        ids
      }
    }
  }
}

export const apiGeneric = (apiClient: Object) =>
function* _apiGeneric(action: CrudAction<any>): Generator<Effect, void, any> {
  const { method, path, params, data, fetchConfig } = action.payload
  const { success, failure, schema, model } = action.meta
  const meta = {
    ...action.meta,
    fetchTime: Date.now()
  }

  try {
    const response = yield call(apiClient[method], path, { params, data, fetchConfig })
    yield put(normalizeToAction(response, action, meta))
  } catch (error) {
    yield put({ meta, type: failure, payload: error, error: true })
  }
}

const watchFetch = (apiClient) => function* _watchFetch() {
  yield* takeEvery(FETCH, apiGeneric(apiClient))
}

const watchFetchOne = (apiClient) => function* _watchFetchOne() {
  yield* takeEvery(FETCH_ONE, apiGeneric(apiClient))
}

const watchCreate = (apiClient) => function* _watchCreate() {
  yield* takeEvery(CREATE, apiGeneric(apiClient))
}

const watchUpdate = (apiClient) => function* _watchUpdate() {
  yield* takeEvery(UPDATE, apiGeneric(apiClient))
}

const watchDelete = (apiClient) => function* _watchDelete() {
  yield* takeEvery(DELETE, apiGeneric(apiClient))
}

const watchApiCall = (apiClient) => function* _watchApiCall() {
  yield* takeEvery(API_CALL, apiGeneric(apiClient))
}

export default function crudSaga(apiClient: Object) {
  return function* _crudSaga(): Generator<Effect, void, any> {
    yield [
      fork(watchFetch(apiClient)),
      fork(watchFetchOne(apiClient)),
      fork(watchCreate(apiClient)),
      fork(watchUpdate(apiClient)),
      fork(watchDelete(apiClient)),
      fork(watchApiCall(apiClient)),
      fork(garbageCollector)
    ]
  }
}

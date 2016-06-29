# redux-stream
### Warning: Very experimental. Do not use in production.
Use [RxJS 5](https://github.com/ReactiveX/RxJS) to compose side effect streams with Redux. `redux-stream` is a Redux store enhancer. 

Features:
- Works alongside middleware
- Gradually introduce redux-stream into an application that makes use of thunk-middleware
- Side effect composing of:
 - Ajax
 - Inter module actions (eg. selecting a search filter triggers a search)
 - Independent modules' state changes
 - Independent modules' actions
- Dispatch thunks to cater for conditional dispatching

Dan Abramov opened up an issue on Redux: https://github.com/reactjs/redux/issues/1528
> ## Problem: Side Effects and Composition
> ... This is the big problem with middleware. When you compose independent apps into a single app, neither of them is “at the top”. This is where the today’s Redux paradigm breaks down—we don’t have a good way of composing side effects of independent “subapplications”.

`redux-stream` provides a solution to this issue through state streams. When composing your module's side effects, you have access to all state streams, which allows you to react to an independent module's state changes and produce side effects from it.

## Install

NOTE: This has a peer dependencies of `rxjs@5.0.*` and `redux`

```sh
npm install --save redux-stream
```


## Composing side effects
### Ajax
```js
import { createStore } from 'redux';
import reduxStream, { effects } from 'redux-stream';

// Side effect producer
const searchResponse = action$ =>
  action$.ofType('SEARCH')
    // Grab the query from the payload
    .pluckPayload()
    // Go to the server with the query
    .flatAjax(ProductService.search)
    // Map the server response to the response action
    .mapAction('SEARCH_RESPONSE')

// Plain old reducer
function productSearch(state = { searching: false, results: [] }, action) {
  switch (action.type) {
  case 'SEARCH':
    return {
      ...state,
      searching: true,
    };
  case 'SEARCH_RESPONSE':
    return {
      ...state,
      searching: false,
      results: action.payload,
    };
  default:
    return state;
  } 
};

// Compose module with side effects and reducer
productSearch = effects(searchResponse)(productSearch);

// Create Redux store - enhanced with Redux Stream (no need to 
// combine reducers)
const store = createStore({ productSearch }, reduxStream);

store.subscribe(() =>
  console.log('Search state: ', store.getState().productSearch);
);

store.dispatch({ type: 'SEARCH', payload: 'Foo bar' });
// >_ Search state: { searching: true, results: [] }
// Searching...
// >_ Search state: { searching: false, results: [20] }
```
### Inter module side effects
```js
const initialState = { 
  searching: false,
  movies: [] , 
  searchPhrase: '', 
  genres: ['Drama'], 
  releaseYear: 2016 
};

/** 
  * Search side effect producer. 
  * When selecting genres or year of release, we need to trigger a 
  * movie search (only if we haven't unselected all genres)
  */
const searchSideEffect = (action$, { getState }) =>
  Observable
    .merge(
      // Searching is a side effect of selecting genres 
      action$.ofType('SELECT_GENRES')
        .pluckPayload()
        // Transform into a search query   
        .map(genres => {
          const { searchPhrase, releaseYear } = getState().movies;
          return { searchPhrase, genres, releaseYear };
        }),
      // Searching is a side effect of selecting year of release
      action$.ofType('SELECT_RELEASE_YEAR')
        .pluckPayload()
        // Transform into a search query    
        .map(releaseYear => {
          const { searchPhrase, genres } = getState().movies;
          return { searchPhrase, genres, releaseYear };
        })
    )
    // Only search if we have genres selected
    .filter(query => query.genres.length > 0)
    .mapAction('SEARCH_MOVIES')

// Search response side effect producer
const searchResponse = action$ => 
  action$.ofType('SEARCH_MOVIES')
    // Grab the query from the payload
    .pluckPayload()
    // Go to the server with the query (integrates with promises)   
    .flatAjax(MoviesService.search)
    // Map the server response to the response action
    .mapAction('SEARCH_MOVIES_RESPONSE')

// The reducer
function movieSearch(state = initialState, action) {
  switch (action.type) {
  case 'SELECT_GENRES':
    return {
      ...state,
      genres: action.payload,
    };
  case 'SELECT_RELEASE_YEAR':
    return {
      ...state,
      releaseYear: action.payload,
    };
  case 'SEARCH_MOVIES':
    return {
      ...state,
      searchPhrase: action.payload.searchPhrase,
      searching: true,
    };   
  case 'SEARCH_MOVIES_RESPONSE':
    return {
      ...state,
      searching: false,
      movies: action.payload,
    }; 
  default:
    return state;
  } 
};

// Compose module with side effects and reducer
movieSearch = effects(searchSideEffect, searchResponse)(movieSearch);

const store = createStore({ movieSearch }, reduxStream);

store.subscribe(() =>
  console.log('Movies state: ', store.getState().movieSearch);
);

store.dispatch({ type: 'SELECT_GENRES', payload: ['Drama', 'Action'] });
// >_ Movies state: { searching: false, movies: [], searchPhrase: '', genres: ['Drama', 'Action'], ... }
// >_ Movies state: { searching: true, movies: [], searchPhrase: '', genres: ['Drama', 'Action'], ... }
// Searching...
// >_ Movies state: { searching: false, movies: [20], searchPhrase: '', genres: ['Drama', 'Action'], ... }
```

### Composing side effects of independent modules
```js
function subjectModule(state = { computed: 0 }, action) {
  switch (action.type) {
  case 'COMPUTE':
    return {
      ...state,
      computed: action.payload * 10,
    };
  default:
    return state; 
  }
}

// Side effect producer
const computedResult = (action$, { getState$ }) =>
  // Listen to state changes - skip the initial state 
  getState$('subjectModule').skip(1)
    // Grab the state we are interested in  
    .pluck('computed')
    // Only react when it changes
    .distinctUntilChanged()
    // Map it as the payload to a new action
    .mapAction('COMPUTED_RESULT')

function sideEffectModule(state = { results: [] }, action) {
  switch (action.type) {
  case 'COMPUTED_RESULT':
    return {
      ...state,
      results: state.results.concat(action.payload),
    };
  default:
    return state;
  }
}

// Compose module with side effects and reducer
sideEffectModule = effects(computedResult)(sideEffectModule);

const store = createStore({ subjectModule, sideEffectModule }, reduxStream);

store.subscribe(() => {
  console.log('Subject state: ', store.getState().subjectModule);
  console.log('Side effect state: ', store.getState().sideEffectModule);
});

store.dispatch({ type: 'COMPUTE', payload: 10 });
// >_ Subject state: { computed: 100 }
// >_ Side effect state: { results: [] }
// ...
// >_ Subject state: { computed: 100 }
// >_ Side effect state: { results: [100] }

store.dispatch({ type: 'COMPUTE', payload: 100 });
// >_ Subject state: { computed: 1000 }
// >_ Side effect state: { results: [100] }
// ...
// >_ Subject state: { computed: 1000 }
// >_ Side effect state: { results: [100, 1000] }
```


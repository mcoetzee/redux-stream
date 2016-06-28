# redux-stream
### Warning: Very experimental. Do not use in production.
Use [RxJS 5](https://github.com/ReactiveX/RxJS) to compose streams of side effects with Redux. redux-stream is a Redux store enhancer that works alongside middleware, so it is possible to gradually introduce redux-stream into an application that makes use of thunk-middleware.

Side effect composing of:
- Ajax
- Inter module actions (eg. selecting a search filter triggers a search)
- Independent modules' state changes
- Independent modules' actions

Dan Abramov opened up an issue on Redux: https://github.com/reactjs/redux/issues/1528
> ## Problem: Side Effects and Composition
> ... This is the big problem with middleware. When you compose independent apps into a single app, neither of them is “at the top”. This is where the today’s Redux paradigm breaks down—we don’t have a good way of composing side effects of independent “subapplications”.

redux-stream provides a solution to this issue through state streams. When composing your module's side effects, you have access to all state streams, which allows you to react to an independent module's state changes and produce side effects from it.

## Composing side effects
### Ajax
```js
import { createStore } from 'redux';
import reduxStream from 'redux-stream';

const searchResponse = action$ =>
  action$.ofType('SEARCH')
    // Grab the query from the payload
    .pluckPayload()
    // Go to the server with the query
    .flatAjax(ProductService.search)
    // Map the server response to the response action
    .mapAction('SEARCH_RESPONSE')

const productSearch = {
  effects: [
    searchResponse,
  ],
  // Plain old reducer function - reduces state for provided data flow
  reducer(state = { searching: false, results: [] }, action) {
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
  }
};

const store = createStore({ productSearch }, reduxStream);

store.getState$('productSearch').subscribe(state => {
  console.log('Search state: ', state);
});
// >_ Search state: { searching: false, results: [] }

store.dispatch({ type: 'SEARCH', payload: 'Foo bar' });
// >_ Search state: { searching: true, results: [] }
// Searching...
// >_ Search state: { searching: false, results: [20] }
```
### Inter module side effects
```js
import { createStore } from 'redux';
import reduxStream from 'redux-stream';

const initialState = { 
  searching: false,
  movies: [] , 
  searchPhrase: '', 
  genres: ['Drama'], 
  releaseYear: 2016 
};

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

const searchResponse = action$ => 
  action$.ofType('SEARCH_MOVIES')
    // Grab the query from the payload
    .pluckPayload()
    // Go to the server with the query (integrates with promises)   
    .flatAjax(MoviesService.search)
    // Map the server response to the response action
    .mapAction('SEARCH_MOVIES_RESPONSE')

const movieSearch = {  
  effects: [
    searchSideEffect,
    searchResponse,
  ],
  // Plain old reducer function
  reducer(state = initialState, action) {
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
  }
};

const store = createStore({ movieSearch }, reduxStream);

store.getState$('movieSearch').subscribe(state => {
  console.log('Movies state: ', state);
});
// >_ Movies state: { searching: false, movies: [], ..., releaseYear: 2016,  }

store.dispatch({ type: 'SELECT_GENRES', payload: ['Drama', 'Action'] });
// >_ Movies state: { searching: false, movies: [], searchPhrase: '', genres: ['Drama', 'Action'], ... }
// >_ Movies state: { searching: true, movies: [], searchPhrase: '', genres: ['Drama', 'Action'], ... }
// Searching...
// >_ Movies state: { searching: false, movies: [20], searchPhrase: '', genres: ['Drama', 'Action'], ... }
```

### Composing side effects of independent modules
```js
const subjectModule = (state = { computed: 0 }, action) {
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

const computed = (action$, { getState$ }) =>
  // Listen to state changes - skip the initial state 
  getState$('subjectModule').skip(1)
    // Grab the state we are interested in  
    .pluck('computed')
    // Only react when it changes
    .distinctUntilChanged()
    // Map it as the payload to a new action
    .mapAction('COMPUTED_RESULT')

const sideEffectModule = {
  effects: [
    computed
  ],
  reducer(state = { results: [] }, action) {
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
};

const store = createStore({ subjectModule, sideEffectModule }, reduxStream);

store.getState$('sideEffectModule').subscribe(state => {
  console.log('Side effect state: ', state);
});
// >_ Side effect state: { results: [] }

store.dispatch({ type: 'COMPUTE', payload: 10 });
// >_ Side effect state: { results: [100] }
store.dispatch({ type: 'COMPUTE', payload: 100 });
// >_ Side effect state: { results: [100, 1000] }
```


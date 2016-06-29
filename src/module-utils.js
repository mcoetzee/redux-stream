/**
 * Creates a module definition
 */
export const effects = (...effectsProducers) => reducer => ({
  effects: effectsProducers,
  reducer,
});

export function hydrateActionType(moduleName) {
  return `${moduleName}/HYDRATE`;
}

export function clearStateActionType(moduleName) {
  return `${moduleName}/CLEAR_STATE`;
}

/**
 * Higer order reducer
 */
export const moduleReducer = (moduleName, reducer) => {
  const hydrateType = hydrateActionType(moduleName);
  const clearStateType = clearStateActionType(moduleName);

  return (state, action) => {
    switch (action.type) {
      case hydrateType:
        return {
          ...state,
          ...action.payload,
          hydrated: true,
        };

      case clearStateType:
        return reducer(undefined, action);

      default:
        return reducer(state, action);
    }
  };
};

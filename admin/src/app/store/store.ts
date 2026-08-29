import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { layoutSlice } from './layout.slice';
import { rootSaga } from './root.saga';

const sagaMiddleware = createSagaMiddleware();

export const adminStore = configureStore({
  reducer: { layout: layoutSlice.reducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware),
});

sagaMiddleware.run(rootSaga);

export type RootState = ReturnType<typeof adminStore.getState>;
export type AppDispatch = typeof adminStore.dispatch;

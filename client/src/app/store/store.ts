import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { cartSlice } from './cart.slice';
import { rootSaga } from './root.saga';

const sagaMiddleware = createSagaMiddleware();

export const storefrontStore = configureStore({
  reducer: { cart: cartSlice.reducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware),
});

sagaMiddleware.run(rootSaga);

export type RootState = ReturnType<typeof storefrontStore.getState>;
export type AppDispatch = typeof storefrontStore.dispatch;

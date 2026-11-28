import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from '../config/api';

export default function Index() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((token) => {
      setLoggedIn(Boolean(token));
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return <Redirect href={loggedIn ? '/(tabs)' : '/login'} />;
}

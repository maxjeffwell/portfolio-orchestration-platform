import { MetabaseProvider as MetabaseSDKProvider, defineMetabaseAuthConfig } from '@metabase/embedding-sdk-react';

const METABASE_INSTANCE_URL = import.meta.env.VITE_METABASE_URL;
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const METABASE_ENABLED = import.meta.env.VITE_METABASE_ENABLED === 'true';

export function MetabaseProvider({ children }) {
  // If Metabase is not configured, just render children without the provider
  if (!METABASE_ENABLED || !METABASE_INSTANCE_URL) {
    return <>{children}</>;
  }

  const authConfig = defineMetabaseAuthConfig({
    metabaseInstanceUrl: METABASE_INSTANCE_URL,
    fetchRequestToken: async () => {
      const response = await fetch(`${API_BASE_URL}/metabase/embed-token/sdk`);
      const data = await response.json();
      return data; // Return the full object { jwt: "..." }
    },
  });

  return (
    <MetabaseSDKProvider authConfig={authConfig}>
      {children}
    </MetabaseSDKProvider>
  );
}

export default MetabaseProvider;

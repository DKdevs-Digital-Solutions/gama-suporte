function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export function getConfig() {
  return {
    gsync: {
      baseUrl: required('GSYNC_BASE_URL').replace(/\/+$/, ''),
      login: required('GSYNC_LOGIN'),
      password: required('GSYNC_PASSWORD'),
    },
    linkSecret: required('LINK_SECRET'),
    internalApiKey: required('INTERNAL_API_KEY'),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  };
}

import { createSchema } from 'graphql-yoga';
import { JSONResolver } from 'graphql-scalars';
import { typeDefs } from './typeDefs.js';
import { resolvers } from '../resolvers/index.js';

export const schema = createSchema({
  typeDefs,
  resolvers: {
    JSON: JSONResolver,
    ...resolvers,
  },
});

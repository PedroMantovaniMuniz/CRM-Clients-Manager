import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuração central do Prisma CLI.
 *
 * Este arquivo é carregado por comandos como:
 * - prisma generate
 * - prisma validate
 * - prisma migrate dev
 * - prisma migrate deploy
 * - prisma studio
 *
 * Como o Prisma CLI não deve receber uma DATABASE_URL vazia, validamos a variável
 * antes de devolver a configuração. Assim, erros de ambiente aparecem cedo e com
 * mensagem clara.
 */
const getRequiredEnv = ( name: string ): string => {
  const value = process.env[ name ]?.trim();

  if ( !value ) {
    throw new Error( `Variável de ambiente obrigatória ausente: ${ name }.` );
  }

  return value;
};

/**
 * Permite alterar caminhos por ambiente sem mudar o código.
 * Útil se no futuro você separar schemas/migrations por contexto.
 */
const schemaPath = process.env.PRISMA_SCHEMA_PATH?.trim() || 'prisma/schema.prisma';
const migrationsPath = process.env.PRISMA_MIGRATIONS_PATH?.trim() || 'prisma/migrations';

export default defineConfig( {
  schema: schemaPath,

  migrations: {
    path: migrationsPath
  },

  datasource: {
    url: getRequiredEnv( 'DATABASE_URL' )
  }
} );

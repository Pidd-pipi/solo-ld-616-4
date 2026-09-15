/**
 * embedded-postgres 仅在集成测试中使用，它自带的是 node16/bundler 解析的类型。
 * 应用主 tsconfig 使用 Node 解析，故在此为测试提供最小类型声明，避免改动生产构建配置。
 */
declare module "embedded-postgres" {
  export interface EmbeddedPostgresOptions {
    databaseDir: string;
    user?: string;
    password?: string;
    port?: number;
    persistent?: boolean;
    [key: string]: unknown;
  }

  export default class EmbeddedPostgres {
    constructor(options: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<unknown>;
  }
}

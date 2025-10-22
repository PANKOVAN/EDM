# 📘 Project Best Practices

## 1. Project Purpose
EDM (Entity Data Model) is a Node.js client–server library that streamlines building three-tier applications on top of SQL databases (primarily PostgreSQL). It provides:
- A declarative model DSL (.model.js, .cfg.js, .cfg.json) to define tables, configuration objects, fields, relationships, filters, and scripts.
- An ORM-like runtime with EDMObj/EDMData abstractions for object creation, validation, change tracking, and data packaging for clients.
- Auto-generated SQL with a composable filter system in SQLConnection for robust, injection-safe querying.
- Generic DataController for CRUD-style server endpoints and helpers for configuration, security (token-based access), and file store management.

## 2. Project Structure
- Root
  - index.js: Entry point exporting server modules (edm, helpers, model, utils).
  - package.json: Metadata and runtime dependencies.
  - readme.md: Project overview.
  - sync.js: Script to synchronize/initialize models and database (via edm.sync()).
  - best_practices.md: This document.
- server/
  - edm.js: Core runtime – EDMObj, EDMData, client serialization glue, model initialization, DB connection retrieval, change tracking, access checks, store utilities.
  - model.js: Model DSL and loader. Builds classes, types, tables, configuration descriptors; generates EDM prototypes; loads .model.js/.cfg.js/.cfg.json files; initializes data.
  - helpers.js: Server helpers – settings loader/merger, param parsing, JSON/XML preparation, dates, time utilities, safe JSON, project file resolution.
  - utils.js: DataController – generic CRUD actions for class-based routes; converts requests into params; uses EDMData and SQLConnection.
  - client.js: Client-side helpers for function deserialization, class/cfg preparation, embedded data helpers.
  - db/
    - proto.js: SQLConnection base – parameter handling, SQL templating and filter resolution, CRUD, validation, transaction handling, reference resolution, auto SQL generation (select/from/where/order/suff).
    - postgre.js (+ postgre.sync.js): PostgreSQL driver and synchronization.
    - lite.js (+ lite.sync.js): SQLite driver (optional; present for parity/testing). 
    - store.js: Store integration (referenced in EDMData).
  - log/
    - log.js: Logging wrapper (used by drivers/proto).
- base/, docs/
  - docs/: JSDoc-generated API documentation for modules and runtime.
  - base/: Project-specific base definitions/data (legacy or examples).

Key configuration and entry points
- Settings: Loaded once from any *.settings.js in the project tree via helpers.getSettings(). Merged in filename order. Optional solution.info appended.
- Model loading: model.init() scans project root (settings.rootDir or dirname) for *.model.js and *.cfg.js and runs them in the DSL context. .cfg.json files override or extend configuration data.
- Database sync: edm.initModel() + model.initTables() perform schema sync and seed configured table data (via data()).

## 3. Test Strategy
Current state
- No dedicated tests or test framework are present in the repository. No npm test script defined.

Recommendations
- Unit testing
  - Framework: Jest (preferred), or Mocha + Chai. Add scripts: "test": "jest".
  - Scope: Pure helpers (helpers.js), date/time utilities, parameter parsing, XML/JSON transforms, and model DSL functions where possible.
  - Stubbing/mocking: For DB-related code, mock the SQLConnection layer by stubbing methods (select, selectObj, insert, update, delete, saveData) and the filter pipeline (prepareSQL/prepareSQLFilters) where relevant.
- Integration testing
  - DB-backed: Spin up a disposable PostgreSQL (Docker) or point to a dedicated test DB. Use edm.getEDMData() and EDMData.getConnection() to execute real flows.
  - Seeding: Use model.init() and model.initTables() with a test .settings.js mapping models to a test DB; seed with data() and/or explicit inserts.
  - Cleanup: Wrap with transactions or isolate schemas; always call connection.free() and edmData.free().
- Test organization
  - Place tests in __tests__ or alongside modules as *.test.js.
  - Naming: <module>.test.js for unit, <feature>.int.test.js for integration.
  - Coverage goals: ≥80% on helpers and model DSL; critical DB pathways (insert/update/delete/select) covered by integration tests.

## 4. Code Style
General
- Language: Node.js (CommonJS). Prefer 'use strict' at module top (consistent with server modules).
- Async: Use async/await for asynchronous flows (e.g., connections, queries, file I/O). Ensure try/catch around DB I/O boundaries and call free() on resources.
- Immutability: Avoid mutating internal caches (edm.models/classes/cfg) directly; use provided APIs (refreshModel, model.init, EDMData methods).

Naming conventions
- Files: kebab-case or lowerCamel for modules; .model.js/.cfg.js for model definitions; .cfg.json for configuration overrides.
- Classes: PascalCase (EDMObj, EDMData, DataController, SQLConnection, Model/Field/etc.).
- Variables/functions: lowerCamelCase (helpers.getSettings, edm.getEDMData, prepareData, prepareJSON, prepareSQL*).
- Fields: Primary key field must be named id (enforced by model.js).

Documentation and comments
- Maintain concise JSDoc where appropriate; existing code uses Russian-language comments – preserve language consistency per file.

Error and exception handling
- Throw new Error for exceptions (avoid throwing strings). Some existing code throws string literals; prefer converting to Error for new code.
- Use helpers.errorJson(message, exception, req) to format server errors in HTTP flows.
- In DB layers, log via log.put on exceptions; favor parameterized SQL to avoid injection.

Safe evaluation and function serialization
- Server to client function transfer uses helpers.prepareJson() and client helpers to eval functions (ClientHelpers.eval). Only serialize deterministic, trusted code paths. Avoid dynamic eval for untrusted inputs.

## 5. Common Patterns
- EDMObj/EDMData
  - EDMObj prototypes are generated from model definitions (EDMData.createProto). Accessors coerce types (date, number, bool), manage references (ref/reflist with both value and Id properties), and notify EDMData of updates.
  - EDMData is the request-scoped gateway: tracks connections, caches objects (dic/cfg), records updates (hasUpdates/updates/undo), validation, access checks (testAccess), and packaging for clients (prepareData with dic/data separation).
- Model definition DSL (server/model.js)
  - scheme, base, type, table, cfg to build the model structure.
  - field(type descriptors): string/int/decimal/money/date/datetime/bool/json/jsonb/complex/ref/reflist/props/list/storage/id/guid.
  - behavior & metadata: method, property, refproperty, index, script, filter, order, vfield.
  - data(name, configuration): seeds cfg or table data; .cfg.json files also hydrate EDMData at load.
- SQL auto-generation (server/db/proto.js)
  - prepareSQL* stages (pref/fields/from/where/order/suff) produce parameterized SQL; composable filters via $filterName(param->field)$ placeholders.
  - Built-in filters: like, softlike, in, overlap, date, bool, eq/ne/gt/lt/ge/le, order, vfield, asis, interval.
  - Parameter handling: Named parameters accumulated and translated to positional ($1..$n), always use prepareListParams and filter helpers.
- DataController (server/utils.js)
  - Generic CRUD: run, save, create, nextId, insert, update, delete. Base name inferred from route name (e.g., <class>.data).
  - Always release resources (edmData.free) after request handling.
- Settings
  - helpers.getSettings() reads and merges all *.settings.js (alphabetical; edm*-prefixed prioritized by directory sort). Exposes db, models mapping, store path, app config, etc.
- Store utilities (EDMData)
  - getStoreBasePath/getStorePath/getStoreObjPath/getStoreUrlPath and read/save/copy/remove operations, with cache-busting and timestamp adjustments.

## 6. Do's and Don'ts
✅ Do
- Use EDMData.getConnection(...) for DB access; release via connection.free() and edmData.free().
- Define primary keys as id and let type coercion/accessors manage values.
- Use the model DSL consistently; generate prototypes via model.init(); prefer virtual fields (vfield) and filters for computed/select-only expressions.
- Pass parameters via the templating system and filters; avoid string concatenation in SQL.
- Enforce access with EDMData.testAccess(tokens, exception) where appropriate.
- Use helpers.prepareParams(req) to normalize request inputs (numbers, booleans, JSON, master/parent IDs, files).
- Log and rethrow errors at DB boundaries; format HTTP responses with helpers.errorJson.
- Keep settings in *.settings.js and map models to DB aliases via settings.models.

❌ Don’t
- Don’t mutate obj._values_ directly; use accessors (obj.field) so EDMData can track updates and type conversions.
- Don’t throw plain strings in new code; use Error objects.
- Don’t build SQL via string concatenation with raw inputs; use $param and filter placeholders.
- Don’t bypass connection.free()/edmData.free(); avoid leaking connections/handles.
- Don’t rename id; the system enforces primary key naming and will throw on mismatch.
- Don’t serialize untrusted functions to clients; avoid eval for external inputs.

## 7. Tools & Dependencies
Runtime dependencies
- pg: PostgreSQL client used by server/db/postgre.js.
- bcrypt: Password hashing (helpers.testPassCode/getPassCode).
- uuid: GUID generation (helpers.getUUID).

Project setup
- Node.js 16+ recommended.
- Provide at least one *.settings.js with DB mapping and store path. Example:

```js
// 10.project.settings.js
settings({
  rootDir: __dirname, // optional: project root for model scanning
  db: {
    default: {
      require: 'postgre', // maps to server/db/postgre.js
      dbname: 'mydb',
      dbhost: 'localhost',
      dbuser: 'postgres',
      dbpass: 'secret',
      dbport: 5432
    }
  },
  models: {
    '*': 'default' // map all models to the default DB alias
  },
  store: {
    path: 'd:/data/store' // required for EDMData store operations
  },
  app: { name: 'My EDM App' }
});
```

- Initialize/sync schema and tables:
  - Programmatic: require('./server/edm').sync(); // loads settings, models, syncs DB, initializes tables
  - Or call edm.initModel() after model.init() in custom flows.

Testing addons
- For integration tests, configure a test *.settings.js mapping models to a test database alias and run sync before tests.

## 8. Other Notes
- Model files and configuration
  - *.model.js and *.cfg.js are executed in a DSL context (see modelMethods in server/model.js). Keep them deterministic and idempotent.
  - *.cfg.json overrides/extends configuration at load (values must include {_type, id}).
- Virtual fields and computed values
  - Use vfield and filter placeholders ($vfield, $order, $asis, etc.) for computed columns in select; avoid persisting virtuals.
- Access tokens
  - EDMData.testAccess(tokens, exception) expects hierarchical tokens array or dot-delimited string; the function will roll up scope (e.g., model.table.view).
- Client serialization
  - helpers.prepareJson serializes EDMObj instances (functions become { function: ... }); client.js safely rehydrates with ClientHelpers.
- LLM generation constraints
  - Preserve SQL templating and filter placeholder syntax exactly (e.g., $like(name->"table"."col")$). Do not alter naming or quote styles.
  - Always route DB access through EDMData/SQLConnection; respect id field and ref/reflist semantics.
  - Keep Russian comments/messages intact if modifying modules that are already localized.

'use strict'
/**
 * Библиотека EDM. Базы данных postgresql. Синхронизация
 */
//TODO посметреть умолчания для NOT NULL
//TODO при генерации констроинтов их имена переводятся на мпленький регист наверное надо брать в скобки

//TODO зачем в лог 2 поля upd и del????
//TODO в log добавить индекс по id
const helpers = require('../helpers');
const { models, classes } = require('../model');
const settings = helpers.getSettings();

module.exports = {
    /**
     * Синхронизировать все
     */
    sync: async function (model, dbcfg, passing) {
        console.debug(`SYNC START ${model} (${passing})`);
        if (!model) {
            for (let n in models) {
                let mmm = models[n];
                let dbname = settings.models[mmm._name] || settings.models['*'];
                if (settings.db[dbname] && settings.db[dbname].require == 'postgresql') {
                    await this.sync(mmm, dbcfg, passing);
                }
            }
            return;
        }
        try {
            let edm = require('../edm').getEDMData();
            try {
                if (typeof dbcfg != 'object') dbcfg = settings.db[dbcfg] || settings.models['*'];
                let dbsettings = settings.db[dbcfg];
                let connection = await edm.getConnection(model, null, null, dbcfg);
                // Синхронизировать модель
                if (passing == 1 && !settings._syncreset_) {
                    await this.syncModelPre(connection, model);
                }
                // Получить описание последней синхронизированной модели
                let syncInfo = await this.getSyncInfo(connection, model);
                // Добавить расширения
                if (dbsettings?.extensions) {
                    for (let extensionName in dbsettings.extensions) {
                        if (dbsettings.extensions[extensionName]) {
                            await connection.query(`CREATE EXTENSION IF NOT EXISTS ${extensionName} `);
                            console.debug(`CREATE EXTENSION ${extensionName} `);
                        }
                    }
                }
                // Синхронизировать модель
                await this.syncModel(connection, model, syncInfo, passing);
                // Синхронизировать модель
                if (passing == 2) {
                    await this.syncModelPost(connection, model);
                }
                /*
                // Создать таблицы - расширения для перевода
                await this.syncTrans(connection, model, syncInfo);
                */

                await connection.free();
            }
            finally {
                await edm.free();
            }
        }
        catch (e) {
            console.error(e);
        }
        console.debug(`SYNC END`);
    },
    /**
     * Получить описание данных о текущем состоянии модели по состоянию структур базы данных. Модель соответствует схеме в postgre
     * @param {object} model текущая модель
     */
    getSyncInfo: async function (connection, model) {

        let syncInfo = {};
        // Список таблиц 
        for (let row of (await connection.select(`select table_name from information_schema.tables where table_schema=$name`, { name: model._name }))) {
            syncInfo[row.table_name] = { columns: {}, indexes: {} }
        };
        // Список пользовательских типов
        for (let row of (await connection.select(`select user_defined_type_name from information_schema.user_defined_types where user_defined_type_schema=$name`, { name: model._name }))) {
            syncInfo[row.user_defined_type_name] = { columns: {}, type: true }
        };

        // Список колонок + тип + default + not null
        for (let row of (await connection.select(`select table_name, column_name, column_default, is_nullable, data_type, character_maximum_length, numeric_precision, udt_name from information_schema.columns where table_schema=$name`, { name: model._name }))) {
            let col = {};
            syncInfo[row.table_name].columns[row.column_name] = col;

            col.type = row.data_type;
            if (col.type == 'character varying') {
                col.type = `VARCHAR(${row.character_maximum_length})`;
            }

            col.def = (row.column_default || '')
                .replace('::character varying', '');

            col.null = row.is_nullable == 'YES' ? 'NULL' : 'NOT NULL';

        };
        // Список колонок для пользовательских типов
        for (let row of (await connection.select(`select udt_name, attribute_name, data_type, character_maximum_length from information_schema.attributes where udt_schema=$name`, { name: model._name }))) {
            let col = {};
            syncInfo[row.udt_name].columns[row.attribute_name] = col;

            col.type = row.data_type;
            if (col.type == 'character varying') {
                col.type = `VARCHAR(${row.character_maximum_length})`;
            }

        }

        // Ссылки
        for (let row of (await connection.select(`select   
        pgc.oid,
        tc.table_schema, 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_schema as foreign_table_schema,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name,
        case
          when pgc.confdeltype='c' then 'cascade'
          when pgc.confdeltype='r' then 'restrict'
          else cast(pgc.confdeltype as varchar(32))
        end as relation_type,
        pg_get_constraintdef(pgc.oid) as foreign_script
       from information_schema.table_constraints as tc
          join information_schema.key_column_usage as kcu on   tc.constraint_name=kcu.constraint_name 
          join information_schema.constraint_column_usage as ccu on tc.constraint_name = ccu.constraint_name
          join pg_constraint as pgc on
            pgc.conname=tc.constraint_name
      
      where tc.table_schema=$name
      and  tc.constraint_type='FOREIGN KEY' 
      `, { name: model._name }))) {
            syncInfo[row.table_name].columns[row.column_name].ref = row.foreign_script;
        }

        for (let row of (await connection.select(`select tablename, indexname from pg_indexes where schemaname=$name`, { name: model._name }))) {
            if (!syncInfo[row.tablename]) syncInfo[row.tablename].indexes = [];
            syncInfo[row.tablename].indexes[row.indexname] = {}
        };


        return syncInfo;

    },
    testExistsTable: async function (connection, mname, name) {
        return await connection.query(`select 1 from information_schema.tables where table_schema=$schemaname and table_name=$tablename`, { schemaname: mname, tablename: name });
    },
    testExistsColumn: async function (connection, mname, name, cname) {
        return await connection.query(`select 1 from information_schema.columns where table_schema=$schemaname and table_name=$tablename and column_name=$columnname`, { schemaname: mname, tablename: name, column_name: cname });
    },
    syncModel: async function (connection, model, syncInfo, passing) {
        console.debug(`SYNC MODEL ${model}`);
        // Добавить схему
        if (passing == 1) {
            await connection.query(`CREATE SCHEMA IF NOT EXISTS "${model._name}";`, undefined, true);
        }
        // Проход по модели
        if (passing == 1) {
            for (let t in classes) {
                let table = classes[t];
                let logTableName = `_log_${table._name}`;
                let logTableExists = await this.testExistsTable(connection, model._name, logTableName);
                // Добавить новую таблицу
                if (table._mname == model._name && table._mtype == 'table' && (table._dbtype || 'postgresql') == 'postgresql') {
                    if (!syncInfo[t]) {
                        await connection.query(`CREATE TABLE "${model._name}"."${table._name}" ();`);
                    }
                    // История изменений для таблицы
                    if (table._log) {
                        if (!logTableExists) {
                            await connection.query(`CREATE TABLE "${model._name}"."${logTableName}" ();`);
                        }
                    }
                    else if (logTableExists) {
                        await connection.query(`DROP TABLE "${model._name}"."${logTableName}";`);
                    }
                }
                // Добавить новый комплексный тип
                if (table._mname == model._name && table._mtype == 'type' && (table._dbtype || 'postgresql') == 'postgresql') {
                    if (!syncInfo[t]) {
                        await connection.query(`CREATE TYPE "${model._name}"."${table._name}"  AS (                       );`);
                    }
                }
            }
        }
        // Синхронизировать комплексные типы
        for (let t in classes) {
            let table = classes[t];
            if (table._mname == model._name && table._mtype == 'type' && (table._dbtype || 'postgresql') == 'postgresql') {
                await this.syncType(connection, table, syncInfo[t] || {}, model, undefined, passing);
            }
        }
        // Синхронизировать поля таблиц
        for (let t in classes) {
            let table = classes[t];
            if (table._mname == model._name && table._mtype == 'table' && (table._dbtype || 'postgresql') == 'postgresql') {
                await this.syncTable(connection, table, syncInfo[t] || {}, model, undefined, passing);
                if (table._log) {
                    let logTableName = `_log_${table._name}`;
                    await this.syncTable(connection, table, syncInfo[logTableName] || {}, model, logTableName, passing, true);
                }
            }
        }
        // Проход по модели текущей базы
        if (passing == 2) {
            for (let t in syncInfo) {
                if (!t.startsWith('_')) {
                    let table = classes[t];

                    try {
                        // Удалить таблицу которой нет в модели
                        if (!table || !['table', 'type'].includes(table._mtype) || table._mname != model._name || (table._dbtype || 'postgresql') != 'postgresql') {

                            if (syncInfo[t].type) {
                                await connection.query(`DROP TYPE "${model._name}"."${t}";`);
                            }
                            else {
                                await connection.query(`DROP TABLE "${model._name}"."${t}";`);
                                let logTableName = `_log_${t}`;
                                let logTableExists = await this.testExistsTable(connection, model._name, logTableName);
                                if (logTableExists) {
                                    await connection.query(`DROP TABLE "${model._name}"."${logTableName}";`);
                                }
                            }
                        }
                    }
                    catch (e) {
                        console.debug(e);
                    }
                }
            }
        }
    },
    syncModelPre: async function (connection, model) {
        console.debug(`SYNC PRE ${model}`);
        // Запустить pre скрипты
        for (let t in classes) {
            let table = classes[t];
            if (table._mname == model._name && table._mtype == 'script' && table._stype == 'pre' && (table._dbtype || 'postgresql') == 'postgresql') {
                console.debug(`SYNC PRE ${table._label}`)
                let scripts = table._script;
                if (typeof scripts == 'function') {
                    await scripts(connection);
                }
                else {
                    if (typeof scripts == 'string') scripts = [scripts];
                    if (Array.isArray(scripts)) {
                        for (let i = 0; i < scripts.length; i++) {
                            await connection.query(scripts[i]);
                        }
                    }
                }
            }
        }
    },
    syncModelPost: async function (connection, model) {
        console.debug(`SYNC POST ${model}`);
        // Запустить post скрипты
        for (let t in classes) {
            let table = classes[t];
            if (table._mname == model._name && table._mtype == 'script' && table._stype == 'post' && (table._dbtype || 'postgresql') == 'postgresql') {
                console.debug(`SYNC POST ${table._label}`)
                let scripts = table._script;
                if (typeof scripts == 'function') {
                    await scripts(connection);
                }
                else {
                    if (typeof scripts == 'string') scripts = [scripts];
                    if (Array.isArray(scripts)) {
                        for (let i = 0; i < scripts.length; i++) {
                            await connection.query(scripts[i]);
                        }
                    }
                }
            }
        }
    },
    syncTest: function (curvalue, newvalue) {
        let curvalue1 = (curvalue || '').replace(/\s+|"/g, '');
        let newvalue1 = (newvalue || '').replace(/\s+|"/g, '');
        if (curvalue1.toLowerCase() != newvalue1.toLowerCase()) {
            return true;
        }
        return false;
    },
    syncType: async function (connection, table, tableInfo, model, tableName, passing) {
        if (table && table._mtype == 'type' && (table._dbtype || 'postgresql') == 'postgresql') {
            console.debug(`SYNC TYPE ${table}(${passing})`);
            // Проход по модели
            for (let c in table._childs) {
                let column = table._childs[c];
                if (column._mtype == 'field' && !column.virtual && (column._dbtype || 'postgresql') == 'postgresql') {

                    let typeString = this.getTypeString(connection, column);

                    if (!tableInfo.columns) tableInfo.columns = {};
                    let columnInfo = tableInfo.columns[column._name];

                    if (!passing || passing == 1) {
                        // Добавит новое поле
                        if (!columnInfo) {
                            await connection.query(`ALTER TYPE "${model._name}"."${(tableName || table._name)}" ADD ATTRIBUTE "${column._name}" ${typeString} `);
                            columnInfo = {};
                        }
                        // Изменить существующее
                        else {
                            // Изменить тип колонки
                            if (this.syncTest(columnInfo.type, typeString)) {
                                await connection.query(`ALTER TYPE "${model._name}"."${(tableName || table._name)}" SET DATA TYPE  "${column._name}" ${typeString};`);
                            }
                        }
                    }
                    if (!passing || passing == 2) {
                    }
                }
            }
            // Проход по модели текущей базы
            if (!passing || passing == 2) {
                for (let c in tableInfo.columns) {
                    let column = table._childs[c];
                    // Удалить поле
                    if (!column || column._mtype != 'field' || column.virtual || (column._dbtype || 'postgresql') != 'postgresql') {
                        await connection.query(`ALTER TYPE "${model._name}"."${(tableName || table._name)}" DROP ATTRIBUTE "${c}";`);
                    }
                }
            }
        }
    },
    syncTable: async function (connection, table, tableInfo, model, tableName, passing, isLogTable = false) {
        if (table && table._mtype == 'table' && (table._dbtype || 'postgresql') == 'postgresql') {
            //let isLogTable = tableName && tableName.startsWith('_log_');
            console.debug(`SYNC TABLE ${table}(${passing})`);
            // Проход по модели
            for (let c in table._childs) {
                let column = table._childs[c];
                if (column._mtype == 'field' && !column.virtual && (column._dbtype || 'postgresql') == 'postgresql') {

                    let typeString = this.getTypeString(connection, column);
                    let defString = this.getDefString(connection, column, table, model, tableName);
                    let nullString = this.getNullString(connection, column);
                    let refString = this.getRefString(connection, column, table);
                    let uniqueString = this.getUniqueString(connection, column);

                    if (!tableInfo.columns) tableInfo.columns = {};
                    if (!tableInfo.indexes) tableInfo.indexes = {};
                    let columnInfo = tableInfo.columns[column._name];

                    if (!passing || passing == 1) {
                        // Добавит новое поле
                        if (!columnInfo) {
                            if (column._ptype == 'id') {
                                await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD COLUMN "${column._name}" ${typeString} ${nullString}`);
                                // Добавить последовательность для генерации уникальных id
                                if (!isLogTable) {
                                    if (column._type == 'int' || column._type == 'long' || column._type == 'short') {
                                        if (column._autoincrement_ !== false) {
                                            await connection.query(`CREATE SEQUENCE IF NOT EXISTS "${model._name}"."${(tableName || table._name).toLowerCase()}_id_seq" OWNED BY "${model._name}"."${(tableName || table._name)}"."id"`, undefined, true);
                                        }
                                    }
                                    if (defString) {
                                        await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" SET DEFAULT ${defString}`);
                                    }
                                    await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD PRIMARY KEY (id) `);
                                }
                            }
                            else {
                                if (!isLogTable) {
                                    await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD COLUMN "${column._name}" ${typeString} ${nullString} ${defString ? 'DEFAULT ' + defString : ''}`);
                                }
                                else {
                                    await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD COLUMN "${column._name}" ${typeString}`);
                                }
                            }
                            columnInfo = {};
                        }
                        // Изменить существующее
                        else {
                            if (column._ptype == 'id') {
                                // Добавить последовательность для генерации уникальных id
                                if (!isLogTable) {
                                    if (column._type == 'int' || column._type == 'long' || column._type == 'short') {
                                        if (column._autoincrement_ !== false) {
                                            await connection.query(`CREATE SEQUENCE IF NOT EXISTS "${model._name}"."${(tableName || table._name).toLowerCase()}_id_seq" OWNED BY "${model._name}"."${(tableName || table._name)}"."id"`, undefined, true);
                                        }
                                    }

                                    if (this.syncTest(columnInfo.def, defString)) {
                                        if (defString) {
                                            await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" SET DEFAULT ${defString}`, undefined, true);
                                        }
                                        else {
                                            await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" DROP DEFAULT `, undefined, true);
                                        }
                                    }
                                    if (!tableInfo.indexes[`${(tableName || table._name)}_pkey`]) await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD PRIMARY KEY (id) `);
                                }
                            }


                            // Изменить тип колонки
                            if (this.syncTest(columnInfo.type, typeString)) {
                                try {
                                    await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" SET DATA TYPE ${typeString};`);
                                }
                                catch (e) {
                                    console.warn(`Невозможно автоматически привести поле "${model._name}"."${(tableName || table._name)}"."${column._name}" к типу ${typeString}`);
                                    console.warn(`Поле "${model._name}"."${(tableName || table._name)}"."${column._name}" поле будет пересоздано с потерей данных`);
                                    await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" DROP COLUMN "${column._name}";`);
                                    if (!isLogTable) {
                                        await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD COLUMN "${column._name}" ${typeString} ${nullString} ${defString ? 'DEFAULT ' + defString : ''}`);
                                    }
                                    else {
                                        await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD COLUMN "${column._name}" ${typeString}`);
                                    }
                                }
                            }
                            // Изменить умолчание
                            if (this.syncTest(columnInfo.def, defString)) {
                                if (!isLogTable) {
                                    if (defString) {
                                        await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" SET DEFAULT ${defString}`);
                                    }
                                    else {
                                        await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" DROP DEFAULT`);
                                    }
                                }
                            }
                            // Изменить null
                            if (this.syncTest(columnInfo.null, nullString)) {
                                if (!isLogTable) {
                                    if (nullString == "NOT NULL") {
                                        await connection.query(`UPDATE "${model._name}"."${(tableName || table._name)}" SET "${column._name}"=DEFAULT WHERE "${column._name}" IS NULL;`);
                                        await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" SET NOT NULL`);
                                    }
                                    else {
                                        await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ALTER COLUMN "${column._name}" DROP NOT NULL`);
                                    }
                                }
                            }
                        }
                        // Добавить поля для истории изменений
                        if (isLogTable) {
                            await this.addLogColumn(connection, table._mname, tableName, '_log_opr_type', 'CHARACTER(1)');
                            await this.addLogColumn(connection, table._mname, tableName, '_log_upd_time', 'TIMESTAMP');
                            await this.addLogColumn(connection, table._mname, tableName, '_log_upd_user', 'INTEGER');
                            await this.addLogColumn(connection, table._mname, tableName, '_log_del_time', 'TIMESTAMP');
                            await this.addLogColumn(connection, table._mname, tableName, '_log_del_user', 'INTEGER');

                        }
                    }
                    if (!passing || passing == 2) {
                        if (!isLogTable) {
                            // Изменить связи
                            if (this.syncTest(columnInfo ? columnInfo.ref : '', refString)) {
                                await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" DROP CONSTRAINT IF EXISTS "REF_${model._name}_${(tableName || table._name)}_${column._name}"`);
                                if (refString) await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD CONSTRAINT "REF_${model._name}_${(tableName || table._name)}_${column._name}" ${refString}`);
                            }
                            // Изменить уникальность
                            if (this.syncTest(columnInfo ? columnInfo.unique : '', uniqueString)) {
                                await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" DROP CONSTRAINT IF EXISTS "UNIQUE_${model._name}_${(tableName || table._name)}_${column._name}"`);
                                if (uniqueString) await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" ADD CONSTRAINT "UNIQUE_${model._name}_${(tableName || table._name)}_${column._name}" ${uniqueString}`);
                            }
                            // Добавить последовательность для генерации уникальных id
                            if (column._ptype == 'id' && (column._type == 'int' || column._type == 'long' || column._type == 'short')) {
                                if (column._autoincrement_ !== false) {
                                    await connection.query(`select setval('${model._name}.${(tableName || table._name).toLowerCase()}_id_seq',coalesce(max(id),1)) from "${model._name}"."${(tableName || table._name)}" where id>0`, undefined, true);
                                }
                            }
                        }
                        // Добавить индекс по id
                        else {
                            if ((table._childs['id'] || {})._ptype == 'id') {
                                let indexname = `PRIMARY_INDEX_${model._name}_${(tableName || table._name)}_${'id'}`.toLowerCase();
                                let script = `CREATE INDEX IF NOT EXISTS ${indexname} ON "${model._name}"."${(tableName || table._name)}" ("${'id'}")`;
                            }
                        }
                        // Добавить индекс по вторичным ключам
                        if (column._ptype == 'ref') {
                            if (!isLogTable) {
                                let indexname = `FOREIGN_INDEX_${model._name}_${(tableName || table._name)}_${column._name}`.toLowerCase();
                                let script = `CREATE INDEX IF NOT EXISTS ${indexname} ON "${model._name}"."${(tableName || table._name)}" ("${column._name}")`;
                                if (!tableInfo.indexes[indexname] || tableInfo.indexes[indexname].script != script || settings._syncreset_) {
                                    await connection.query(`DROP INDEX IF EXISTS "${model._name}".${indexname}`);
                                    await connection.query(script);
                                }
                            }
                        }
                    }
                }
                // Индексы
                else if (column._mtype == 'index' && (column._dbtype || 'postgresql') == 'postgresql') {
                    if (!passing || passing == 2) {
                        if (!isLogTable) {
                            let indexname = `INDEX_${model._name}_${(tableName || table._name)}_${column._name}`.toLowerCase();
                            let script = `CREATE ${column._unique ? 'UNIQUE' : ''} INDEX ${indexname} ON "${model._name}"."${(tableName || table._name)}" ${column._script}`;
                            if (!tableInfo.indexes[indexname] || tableInfo.indexes[indexname].script != script || settings._syncreset_) {
                                await connection.query(`DROP INDEX IF EXISTS "${model._name}".${indexname}`);
                                await connection.query(script);
                            }
                        }
                    }
                }
                // Скрипты
                else if (column._mtype == 'script' && (column._dbtype || 'postgresql') == 'postgresql') {
                    if (!passing || passing == 2) {
                        if (!isLogTable) {
                            await connection.query(column._script);
                        }
                    }
                }
            }
            // Проход по модели текущей базы
            if (!passing || passing == 2) {
                for (let c in tableInfo.columns) {
                    let column = table._childs[c];
                    // Удалить поле
                    if (!column || column._mtype != 'field' || column.virtual || (column._dbtype || 'postgresql') != 'postgresql') {
                        if (!c.startsWith('_log_')) {
                            await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" DROP COLUMN "${c}";`);
                        }
                    }
                }
                for (let i in tableInfo.indexes) {
                    if (!i.endsWith("_pkey") && !i.startsWith('foreign_')) {
                        let pref = `INDEX_${model._name}_${(tableName || table._name)}_`.toLowerCase();
                        let index = table._childs[i.substring(pref.length)];
                        // Удалить индекс
                        if (!index || index._mtype != 'index' || (index._dbtype || 'postgresql') != 'postgresql') {
                            await connection.query(`ALTER TABLE "${model._name}"."${(tableName || table._name)}" DROP CONSTRAINT IF EXISTS "${i}"`);
                            await connection.query(`DROP INDEX IF EXISTS "${model._name}"."${i}"`);
                        }
                    }
                }
            }
        }
    },
    getTypeString: function (connection, column, refMode = false) {
        if (!column) return '';
        return connection.getTypeString(column, refMode);
    },
    getDefString: function (connection, column, table, model, tableName) {
        if (!column) return '';
        if (!column._sqldefault && column._ptype != 'id' && column._type != 'guid' && !column._notnull) return '';
        let r = '';
        if (column._sqldefault) r = `(${column._sqldefault})`
        else if (column._ptype == 'id' && (column._type == 'int' || column._type == 'long' || column._type == 'short')) {
            if (column._autoincrement_ !== false) {
                r = `nextval('${model._name}.${(tableName || table._name)}_id_seq'::regclass)`
            }
        }
        else if (column._type == 'guid' && column._notnull) r = `gen_random_uuid()`;
        else {
            if (column._notnull) {
                switch (column._type) {
                    case 'string':
                        r = `''`;
                        if (column._default) {
                            if (column._default.startsWith("'")) r = column._default;
                            else r = `'${column._default}'`;
                        }
                        break;
                    case 'int':
                    case 'long':
                    case 'byte':
                    case 'short':
                    case 'float':
                    case 'double':
                    case 'decimal':
                    case 'money':
                        r = `0`;
                        if (column._default) {
                            r = `${column._default}`;
                        }
                        break;
                    case 'datetime':
                    case 'date':
                    case 'time':
                        r = `now()`;
                        break;
                    case 'bool':
                        r = 'false';
                        break;
                    default:
                        if (column._ptype == "ref") {
                            if (column._default) {
                                let refDef = connection.edm.getModelDef(column._type);
                                if (!refDef) throw `POSTGRESQL. Определение типа данных. Ссылка ${column._type} не найдена`;
                                let refIdColumn = refDef._childs['id'];
                                if (!refIdColumn) throw `POSTGRESQL. Определение типа данных. Поле id для ${column._type} не найдено`;
                                if (refIdColumn._type == 'string') {
                                    if (column._default.startsWith("'")) r = column._default;
                                    else r = `'${column._default}'`;
                                }
                                else {
                                    r = column._default;
                                }
                            }
                        }
                        break;
                }
            }
        }
        //if (r !== '') {
        //  r = `DEFAULT  ${r}`;
        //}
        return r;
    },
    getNullString: function (connection, column) {
        if (!column) return '';
        let r = 'NULL';
        if (column._notnull) r = 'NOT NULL';
        return r;
    },
    getRefString: function (connection, column, table) {
        if (!column) return '';
        let r = '';
        if (column._ptype == 'ref') {
            let refTable = connection.edm.getModelDef(column._type, ['table'], false);
            if (refTable) {
                let modelName = refTable._mname;
                let valid = "";
                if (column._mode == 'cascade' || column._mode == 'c') valid = 'ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED';
                else if (column._mode == 'restrict' || column._mode == 'r') valid = 'DEFERRABLE INITIALLY DEFERRED';
                else if (column._mode == 'set null') valid = 'ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED';
                else if (column._mode == 'none') valid = '';
                else throw new Error(`Неправильное описание ссылки (${refTable._mname}.${table._name}.${column._name})`);

                if (valid) r = `FOREIGN KEY ("${column._name}") REFERENCES "${modelName}"."${refTable._name}"(id) ${valid}`;
            }
        }
        return r;
    },
    getUniqueString: function (connection, column) {
        if (!column) return '';
        let r = '';
        if (column._unique) {
            r = `UNIQUE("${column._name}")`;
        }
        return r;
    },
    async addLogColumn(connection, schemeName, tableName, columnName, dataType) {
        await connection.query(`ALTER TABLE "${schemeName}"."${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${dataType}`);
    },
    _toSqlString(s) {
        return s.replace(/'/g, "''");
    },
};

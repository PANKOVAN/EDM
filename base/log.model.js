/**
 * Доступ
 */
scheme('log', 'Системный журнал', null,
    {
        _basetype: 'postgresql',
        _description: 'Системный журнал'
    },
    [

        /**
         * Список пользователей
         */
        table('log', 'Системный журнал', '', {}, [
            field('type', 'Тип сообщения', ref('logType', 'none')),
            field('vtype', 'Вид', ref('logVType', 'none')),
            field('stype', 'Кластер', ref('logSType', 'none')),
            field('value', 'Cообщение', string()),
            field('jvalue', 'Cообщение', jsonb()),
            field('time', 'Дата и время записи', datetime(true, 'now()')),
            field('user', 'Пользователь', int(false)),

            order('byDefault', 'Сортировка по умолчанию', "", '"log"."time"'),
            order('byReverseDef', 'Сортировка обратная по умолчанию', "", '"log"."time" desc'),
        ]),

        /**
         * Тип сообщения
         */
        cfg('logType', 'Тип сообщения', 'cfgObj', null, [
            field('type', 'Отображение', string(1, true, 's', 's')),
        ]),
        /**
         * Кластер
         */
        cfg('logSType', 'Кластер', 'cfgObj', null, [
        ]),
        /**
        /**
         * Вид сообщения
         */
        cfg('logVType', 'Вид сообщения', 'cfgObj', null, [
        ]),

    ]);

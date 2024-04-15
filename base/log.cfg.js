
/**
 * Тип сообщения
*/
data('logType', {
    INF: { name: 'Информация', type: 'n' },
    WAR: { name: 'Предупреждение', type: 'n' },
    ERR: { name: 'Ошибка' },
    EXC: { name: 'Исключение' },
    SYS: { name: 'Система', type: 'n' },
    STAT: { name: 'Статистика', type: 'n' },
})

data('logVType', {
    SERVERSTART: { name: 'Запуск сервера' },
    SQL: { name: 'Запросы к базе' },
})


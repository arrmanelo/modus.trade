// Модус Сигнал — демонстрационная оргструктура: подразделения, сотрудники, категории, правила маршрутизации.
// Все имена вымышлены. Роли и ответственные взяты из датасета хакатона.

export const SEED_DEPARTMENTS = [
  { id: 'd_proc', name: 'Закупки', headId: 'u_proc_head' },
  { id: 'd_acc', name: 'Бухгалтерия', headId: 'u_acc_head' },
  { id: 'd_sales', name: 'Продажи', headId: 'u_sales_head' },
  { id: 'd_design', name: 'Проектирование', headId: 'u_design_head' },
  { id: 'd_pmo', name: 'Проектный офис', headId: 'u_pmo_head' },
  { id: 'd_it', name: 'IT-разработка', headId: 'u_it_head' },
  { id: 'd_adm', name: 'Административная служба', headId: 'u_adm_head' },
  { id: 'd_hr', name: 'HR и внутренние коммуникации', headId: 'u_hr' },
  { id: 'd_mgmt', name: 'Управление и развитие', headId: 'u_dir' },
];

// role: employee | handler | manager | admin
export const SEED_USERS = [
  { id: 'u_emp_proc', name: 'Ольга Миронова', position: 'Сотрудник закупок', departmentId: 'd_proc', role: 'employee', demo: 1 },
  { id: 'u_emp_acc', name: 'Ирина Белова', position: 'Сотрудник бухгалтерии', departmentId: 'd_acc', role: 'employee' },
  { id: 'u_sales', name: 'Дмитрий Орлов', position: 'Менеджер по продажам', departmentId: 'd_sales', role: 'employee' },
  { id: 'u_designer', name: 'Павел Гусев', position: 'Сотрудник проектирования', departmentId: 'd_design', role: 'employee' },
  { id: 'u_coord', name: 'Мария Лебедева', position: 'Координатор проекта', departmentId: 'd_pmo', role: 'employee' },
  { id: 'u_pm', name: 'Андрей Захаров', position: 'Руководитель проекта', departmentId: 'd_pmo', role: 'employee' },
  { id: 'u_office', name: 'Елена Ткач', position: 'Сотрудник офиса', departmentId: 'd_adm', role: 'employee' },

  { id: 'u_nomen', name: 'Виктор Сомов', position: 'Ответственный за номенклатуру', departmentId: 'd_proc', role: 'handler' },
  { id: 'u_training', name: 'Наталья Ершова', position: 'Ответственный за обучение', departmentId: 'd_hr', role: 'handler', deputyId: 'u_hr', absentFromDaysAgo: 6, absentUntilDays: 9 },
  { id: 'u_process', name: 'Кирилл Яковлев', position: 'Ответственный за процессы', departmentId: 'd_mgmt', role: 'handler' },
  { id: 'u_it', name: 'Тимур Ахметов', position: 'IT-специалист', departmentId: 'd_it', role: 'handler', deputyId: 'u_it_head', demo: 2 },
  { id: 'u_contracts', name: 'Юлия Савченко', position: 'Ответственный за договоры', departmentId: 'd_mgmt', role: 'handler' },
  { id: 'u_docs', name: 'Роман Фролов', position: 'Администратор документов', departmentId: 'd_adm', role: 'handler' },

  { id: 'u_proc_head', name: 'Игорь Власов', position: 'Руководитель закупок', departmentId: 'd_proc', role: 'manager' },
  { id: 'u_acc_head', name: 'Светлана Петрова', position: 'Руководитель бухгалтерии', departmentId: 'd_acc', role: 'manager' },
  { id: 'u_sales_head', name: 'Максим Егоров', position: 'Руководитель продаж', departmentId: 'd_sales', role: 'manager' },
  { id: 'u_design_head', name: 'Олег Назаров', position: 'Руководитель проектирования', departmentId: 'd_design', role: 'manager' },
  { id: 'u_pmo_head', name: 'Татьяна Волкова', position: 'Руководитель проектов', departmentId: 'd_pmo', role: 'manager' },
  { id: 'u_it_head', name: 'Евгений Лаптев', position: 'Руководитель IT-разработки', departmentId: 'd_it', role: 'manager' },
  { id: 'u_adm_head', name: 'Галина Кузнецова', position: 'Административный руководитель', departmentId: 'd_adm', role: 'manager' },
  { id: 'u_hr', name: 'Алина Морозова', position: 'HR / внутренние коммуникации', departmentId: 'd_hr', role: 'manager' },
  { id: 'u_dir', name: 'Артём Соловьёв', position: 'Руководитель направления', departmentId: 'd_mgmt', role: 'manager', demo: 3 },
  { id: 'u_admin', name: 'Анна Григорьева', position: 'Администратор системы, координатор', departmentId: 'd_mgmt', role: 'admin', demo: 4 },
];

export const SEED_GROUPS = [
  { id: 'g_process', name: 'Процессы и взаимодействие', icon: 'route' },
  { id: 'g_docs', name: 'Документы и данные', icon: 'file' },
  { id: 'g_it', name: 'IT и рабочие системы', icon: 'cpu' },
  { id: 'g_projects', name: 'Проекты и ресурсы', icon: 'layers' },
  { id: 'g_people', name: 'Люди и развитие', icon: 'users' },
  { id: 'g_transparency', name: 'Прозрачность и информирование', icon: 'eye' },
  { id: 'g_office', name: 'Офис и корпоративная среда', icon: 'home' },
  { id: 'g_other', name: 'Другое', icon: 'help' },
];

export const SEED_CATEGORIES = [
  { id: 'c_interdept', groupId: 'g_process', name: 'Межотдельное взаимодействие', keywords: ['заявк', 'смежн', 'передач', 'отдел'] },
  { id: 'c_regl', groupId: 'g_process', name: 'Регламенты', keywords: ['регламен', 'инструк', 'памятк', 'порядок'] },
  { id: 'c_tasks', groupId: 'g_process', name: 'Постановка задач', keywords: ['поручен', 'задач', 'срок', 'результат'] },
  { id: 'c_speed', groupId: 'g_process', name: 'Оперативность', keywords: ['срок', 'ответ', 'задержк', 'срочн'] },
  { id: 'c_taskcomm', groupId: 'g_process', name: 'Задачи и коммуникации', keywords: ['задач', 'обсужден', 'истори', 'закрыва'] },
  { id: 'c_comm', groupId: 'g_process', name: 'Коммуникации', keywords: ['канал', 'контекст', 'чат', 'обсужден'] },
  { id: 'c_docflow', groupId: 'g_docs', name: 'Документооборот', keywords: ['докумен', 'пакет', 'согласов', 'счет'] },
  { id: 'c_storage', groupId: 'g_docs', name: 'Хранение документов', keywords: ['папк', 'верси', 'редакц', 'архив', 'актуальн'] },
  { id: 'c_catalog', groupId: 'g_docs', name: 'Каталог и данные', keywords: ['номенкл', 'карточк', 'издели', 'позици', 'дубл'] },
  { id: 'c_contracts', groupId: 'g_docs', name: 'Договорная работа', keywords: ['договор', 'приложен', 'коммерч', 'шаблон'] },
  { id: 'c_it', groupId: 'g_it', name: 'Интеграции и IT', keywords: ['систем', 'ввод', 'синхрон', 'интеграц', 'доступ', 'vpn', 'crm', 'битрикс'] },
  { id: 'c_projects', groupId: 'g_projects', name: 'Проектная деятельность', keywords: ['проект', 'специф', 'оборуд', 'изменен'] },
  { id: 'c_resources', groupId: 'g_projects', name: 'Планирование ресурсов', keywords: ['загруж', 'ресурс', 'планир', 'нагрузк'] },
  { id: 'c_training', groupId: 'g_people', name: 'Обучение', keywords: ['обучен', 'заняти', 'семинар', 'вебинар', 'линейк'] },
  { id: 'c_knowledge', groupId: 'g_people', name: 'Знания и наставничество', keywords: ['нович', 'новог', 'настав', 'база', 'знани'] },
  { id: 'c_transparency', groupId: 'g_transparency', name: 'Информационная прозрачность', keywords: ['статус', 'стади', 'прозрач', 'видеть'] },
  { id: 'c_results', groupId: 'g_transparency', name: 'Прозрачность результатов', keywords: ['результат', 'обзор', 'публик', 'улучшен'] },
  { id: 'c_office', groupId: 'g_office', name: 'Корпоративная среда', keywords: ['офис', 'помещен', 'переговор', 'перерыв', 'зон'] },
  { id: 'c_other', groupId: 'g_other', name: 'Другое / не знаю, куда отнести', keywords: [] },
];

// Правила маршрутизации проверяются по порядку; срабатывает первое подходящее.
// target.kind: 'user' — конкретный сотрудник; 'authorDepartmentHead' — руководитель подразделения автора.
export const SEED_RULES = [
  { id: 'r_praise', name: 'Положительные отзывы → HR / внутренние коммуникации', type: 'praise', categoryId: null, target: { kind: 'user', userId: 'u_hr' } },
  { id: 'r_interdept', name: 'Межотдельное взаимодействие → руководитель подразделения автора', categoryId: 'c_interdept', target: { kind: 'authorDepartmentHead' } },
  { id: 'r_regl', name: 'Регламенты → Ответственный за процессы', categoryId: 'c_regl', target: { kind: 'user', userId: 'u_process' } },
  { id: 'r_tasks', name: 'Постановка задач → Руководитель направления', categoryId: 'c_tasks', target: { kind: 'user', userId: 'u_dir' } },
  { id: 'r_speed', name: 'Оперативность → Руководитель направления', categoryId: 'c_speed', target: { kind: 'user', userId: 'u_dir' } },
  { id: 'r_taskcomm', name: 'Задачи и коммуникации → руководитель подразделения автора', categoryId: 'c_taskcomm', target: { kind: 'authorDepartmentHead' } },
  { id: 'r_comm', name: 'Коммуникации → IT-специалист', categoryId: 'c_comm', target: { kind: 'user', userId: 'u_it' } },
  { id: 'r_docflow', name: 'Документооборот → Руководитель бухгалтерии', categoryId: 'c_docflow', target: { kind: 'user', userId: 'u_acc_head' } },
  { id: 'r_storage', name: 'Хранение документов → Администратор документов', categoryId: 'c_storage', target: { kind: 'user', userId: 'u_docs' } },
  { id: 'r_catalog', name: 'Каталог и данные → Ответственный за номенклатуру', categoryId: 'c_catalog', target: { kind: 'user', userId: 'u_nomen' } },
  { id: 'r_contracts', name: 'Договорная работа → Ответственный за договоры', categoryId: 'c_contracts', target: { kind: 'user', userId: 'u_contracts' } },
  { id: 'r_it', name: 'Интеграции и IT → IT-специалист', categoryId: 'c_it', target: { kind: 'user', userId: 'u_it' } },
  { id: 'r_projects', name: 'Проектная деятельность → Руководитель проектов', categoryId: 'c_projects', target: { kind: 'user', userId: 'u_pmo_head' } },
  { id: 'r_resources', name: 'Планирование ресурсов → Руководитель проектирования', categoryId: 'c_resources', target: { kind: 'user', userId: 'u_design_head' } },
  { id: 'r_training', name: 'Обучение → Ответственный за обучение', categoryId: 'c_training', target: { kind: 'user', userId: 'u_training' } },
  { id: 'r_knowledge', name: 'Знания и наставничество → руководитель подразделения автора', categoryId: 'c_knowledge', target: { kind: 'authorDepartmentHead' } },
  { id: 'r_transparency', name: 'Информационная прозрачность → Руководитель направления', categoryId: 'c_transparency', target: { kind: 'user', userId: 'u_dir' } },
  { id: 'r_results', name: 'Прозрачность результатов → руководитель подразделения автора', categoryId: 'c_results', target: { kind: 'authorDepartmentHead' } },
  { id: 'r_office', name: 'Корпоративная среда → Административный руководитель', categoryId: 'c_office', target: { kind: 'user', userId: 'u_adm_head' } },
];

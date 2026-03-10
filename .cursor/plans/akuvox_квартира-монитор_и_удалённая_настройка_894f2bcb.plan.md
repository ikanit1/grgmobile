---
name: Akuvox квартира-монитор и удалённая настройка
overview: "Связка «квартира — монитор» и возможность удалённой настройки: хранение номера вызова (extension) по квартире, передача его на панель в contact/add (Phone), опция удалённой настройки монитора при наличии API у внутренней панели."
todos: []
isProject: false
---

# План: как монитор понимает «это он», и автоматизация через бэкенд

## Текущая архитектура

```mermaid
sequenceDiagram
  participant Panel as Вызывная панель
  participant Backend as Бэкенд
  participant App as Мобильное приложение
  participant Monitor as Внутренний монитор (опционально)
  Panel->>Backend: Webhook incoming_call (apartmentNumber)
  Backend->>Backend: getResidentIdsForCall(buildingId, apartmentNumber)
  Backend->>App: Push (жителям квартиры)
  Note over Panel,Monitor: Прямой вызов панель→монитор не настроен
```



- Сейчас панель при выборе квартиры шлёт вебхук в бэкенд; бэкенд находит жителей по `apartmentNumber` и отправляет **только push в мобильное приложение**. Связь «панель → внутренний монитор» (SIP/IP) в коде не реализована.
- В [akuvox_config.py](akuvox_config.py) при синхронизации контактов на панель передаётся только `Name` (номер квартиры), поле **Phone пустое** — панели некуда звонить на внутреннее устройство.

Чтобы **монитор понял, что вызов ему**: панель должна звонить на конкретный адрес (SIP-номер или IP). Этот номер/расширение должен быть:

1. настроен на самом мониторе (Extension/Account),
2. передан на вызывную панель в контакте (поле **Phone** в `/api/contact/add`), чтобы панель инициировала вызов на этот номер.

---

## Часть 1: Связка «квартира — номер вызова» в бэкенде и на панели

**Идея:** хранить для квартиры опциональное **расширение/номер вызова** (SIP или тот же номер, что на мониторе). При синхронизации конфига отдавать на панель контакты с заполненным **Phone** — тогда панель сможет звонить на монитор.


| Шаг | Действие                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Сущность Apartment:** добавить необязательное поле `extension` (string, nullable) — номер/расширование для вызова с панели (то, что должно быть настроено на мониторе). Миграция/синхронизация схемы БД при необходимости.                                                                                                                              |
| 2   | **API квартир:** в DTO создания/обновления квартиры добавить опциональное поле `extension`; в ответах списков/одной квартиры — возвращать `extension`.                                                                                                                                                                                                    |
| 3   | **Provision config:** вместо одного массива `apartmentNumbers` передавать в скрипт список объектов, например `apartmentContacts: { number: string, extension?: string }[]`, чтобы скрипт мог подставить `Phone` в контакт. Обратная совместимость: если в конфиге приходят старые `apartmentNumbers`, скрипт по-прежнему создаёт контакты с пустым Phone. |
| 4   | **[akuvox_config.py](akuvox_config.py):** в `apply_contacts` принимать либо `apartmentContacts` (предпочтительно), либо `apartmentNumbers`. Для каждого контакта: `Name` = номер квартиры, `Phone` = extension или пустая строка.                                                                                                                         |
| 5   | **Админка:** на вкладке «Квартиры» в форме создания/редактирования квартиры добавить поле «Расширение (SIP/номер для вызова монитора)» и отображать его в списке квартир здания. Подсказка: «Если указано, панель будет звонить на этот номер; такой же номер должен быть настроен на внутреннем мониторе.»                                               |


После этого: в админке задаёте квартире extension (например, `101`), синхронизируете конфиг — на панели в контакте будет Name=101, Phone=101; панель при выборе 101 сможет инициировать вызов на 101; монитор, у которого в настройках указан номер 101, получит вызов.

---

## Часть 2: Как монитор «узнаёт», что это он

- **На мониторе** в настройках (Account / Intercom / Extension) указывается один номер — например, 101.  
- **В системе** у квартиры с номером 101 задаётся `extension: "101"`.  
- При синхронизации на панель уходит контакт: Name=101, Phone=101.  
- При нажатии «101» на панели она звонит на номер 101; монитор с extension 101 принимает вызов.

Итог: **идентификация по совпадению номера вызова (extension)**: в БД и на панели — один и тот же номер, на мониторе вручную или через API выставляется тот же номер.

---

## Часть 3: Удалённая настройка монитора через бэкенд

**Ограничение:** удалённая настройка возможна только если у **внутреннего монитора** есть HTTP/другой API, позволяющий выставить Extension/Account. В коде сейчас есть только сущности **вызывных** устройств (DOORPHONE); внутренние мониторы не заведены и не настраиваются.

Варианты:

**A) Только бэкенд + панель (без API монитора)**  

- Бэкенд хранит и отдаёт на панель `extension` по квартирам.  
- Настройка номера на мониторе — **вручную** (инструкция для жителя или мастера).  
- Автоматизирована только «одна точка правды» в админке и синхронизация с панелью.

**B) Удалённая настройка монитора (если API есть)**  

- Нужна документация или исследование: есть ли у внутренних панелей Akuvox (или используемой модели) Linux API / HTTP API для установки Extension/Account.  
- Если да — ввести сущность «внутреннее устройство» (например, тип INDOOR, привязка к квартире/зданию), хранить его host/учётные данные и вызывать API устройства при «привязке квартиры к монитору» или по кнопке «Настроить монитор».  
- Если такого API нет — в плане зафиксировать: удалённая настройка монитора не поддерживается, extension задаётся вручную на устройстве и в админке.

Рекомендация: в первой итерации реализовать **Часть 1** и **Часть 2** (extension в БД, передача в contact/add, подсказки в админке); в плане явно указать, что удалённая настройка монитора будет добавлена отдельно при наличии API внутренней панели (с возможным исследованием Akuvox Linux Api для внутренних устройств).

---

## Порядок внедрения (кратко)

1. **Backend:** поле `extension` в Apartment, DTO, provision config с `apartmentContacts`.
2. **Скрипт:** поддержка `apartmentContacts`, передача `Phone` в contact/add.
3. **Админка:** поле «Расширение» при создании/редактировании квартиры, подсказка про монитор.
4. **Документация:** в админке или README — как создать квартиры, задать extension и синхронизировать с панелью; что на мониторе должен быть выставлен тот же номер; что удалённая настройка монитора возможна только при наличии API устройства.

После этого создание квартир и привязка «квартира → номер вызова» делаются в админке; монитор понимает, что вызов ему, за счёт совпадения номера; автоматизация через бэкенд ограничена панелью и при появлении API монитора может быть расширена отдельной задачей. Ваш запрос

Open the Door via HTTP Command 

Updated on Oct 25, 2024

Published on Nov 27, 2023











Documentation

How-to Guide & Video

Intercom

Unlock

Open the Door via HTTP Command





HTTP command enables users to open doors remotely by tapping unlock buttons on Akuvox indoor monitors' talking, call previewing, and monitoring screens.

All Akuvox intercom devices support this feature. This article uses the door phone R29 and indoor monitor C313 as examples.

Set up the Door Phone

Use the device IP to log into the device's web interface. The default username and password are both admin.

Navigate to the Intercom > Relay > Open Relay via HTTP interface.

Tick the Enabled box and customize the username and password for authentication. You can also leave them blank for no authentication.

Keep Session Check disabled. It is used for network security limitations. Enabling it may lead to door-opening failure.



Set up the Indoor Monitor

Use the device IP to log into the device's web interface. The default username and password are both admin.

Navigate to the Phone > Relay > Remote Relay By HTTP or HTTPS interface.

Enter the IP or SIP number of the door phone.

Specify the HTTP URL format and enter the command. Please note that the HTTP format is affected by High Security Mode.

Click here to learn how to check if your device supports and has high security mode enabled.

Click here to view which HTTP command format you should choose.

Enter the username and password if you have set them in the door phone.



Click +Add to save the configuration.

Check High Security Mode

Devices with high security mode enabled only support new HTTP formats, enhancing data transmission security.

You should verify if the device firmware supports high security mode and if the mode is activated.

Go to Status > Basic > Product Information. If the third section of the version number is or bigger than 10, the device is in the firmware version with high security mode.

  

Go to Security > Basic > High Security Mode to see whether the mode is turned on.

  

Specify the HTTP Command Format

If the device firmware does not support high security mode, only the old format is available:

http://{deviceIP}/fcgi/do?action=OpenDoor&UserName={username}&Password={password}&DoorNum=1

Example:

http://192.168.36.111/fcgi/do?action=OpenDoor&UserName=admin&Password=admin&DoorNum=1

If the high security mode is enabled, the device only supports the following two formats.

Option 1: http://{username}:{password}@{deviceIP}/fcgi/OpenDoor?action=OpenDoor&DoorNum=1

Option 2: http://{deviceIP}/fcgi/OpenDoor?action=OpenDoor&DoorNum=1

Use Option 2 when you did not set the username and password for authentication in the door phone.

If the high security mode is off, the device supports all the above three formats.

Tip

DoorNum indicates which relay to trigger:

Relay A: DoorNum = 1

Relay B: DoorNum = 2

To trigger the security relay(Akuvox SR01), use the following commands:

SA: Security Relay A; SB: Security Relay B

With high security mode enabled:

http://{username}:{password}@{deviceIP}/fcgi/OpenDoor?action=OpenDoor&DoorNum=SA/SB

http://{deviceIP}/fcgi/OpenDoor?action=OpenDoor&DoorNum=SA/SB

With high security mode disabled:

You can use the above two formats plus the old format:

http://{deviceIP}/fcgi/do?action=OpenDoor&UserName={username}&Password={password}&DoorNum=SA/SB

Set up Unlock Buttons

After the HTTP command is configured, set up unlock buttons on the desired screen of the indoor monitor.

Open Doors on Talking Screen

Navigate to Phone > Relay > Key Setting > Softkey in Talking Page section.

Enable the desired key and select Remote Relay By HTTP or HTTPS in the Type field.

Name the unlock button in the Label field to distinguish it from other buttons.

After configuration, users can tap the button to open the door.





Open Doors on Monitor Screen

Note

Make sure the monitoring feature is configured. You can refer to the video See the Video Stream from Akuvox Door Phone.

Navigate to Phone > Relay > Key Setting > Softkey In Monitor Page section.

Enable the desired key and select Remote Relay By HTTP or HTTPS in the Type field.

Name the unlock button in the Label field to distinguish it from other buttons. 

After configuration, users can tap the button to open the door.

  



Open Doors on Call Preview Screen

Note

Make sure the video stream from the door phone for preview is configured. You can refer to the video See the Video Stream from Akuvox Door Phone.

Navigate to Phone > Relay > Key Setting > Softkey In Call-Preview Page section.

Enable the desired key and select Remote Relay By HTTP or HTTPS in the Type field.

Name the unlock button in the Label field to distinguish it from other buttons. 

After configuration, users can tap the button to open the door.

## Ответ Gemini

Ваш план теперь подкреплен официальной логикой работы **Akuvox**, и это подтверждает, что вы на правильном пути. Инструкция, которую вы привели, описывает ровно тот же механизм «сопоставления», о котором мы говорили: монитор должен знать, куда (на какой IP/URL) отправить команду разблокировки.

Вот как эта инструкция дополняет ваш план для **X912S** и бэкенда:

## **1. Подтверждение механизма «Кто есть кто»**

Инструкция четко говорит: на мониторе в разделе `Remote Relay By HTTP` нужно прописать **IP или SIP-номер** вызывной панели.

- **В вашем плане:** Поле `extension` в бэкенде становится «точкой правды».
- **Стык:** Если вы используете SIP, то `extension` (например, 101), прописанный в контактах панели, должен совпадать с тем, что монитор ожидает увидеть при входящем звонке, чтобы активировать кнопку открытия.

## **2. Формат команд для X912S (High Security Mode)**

Поскольку X912S — это современная Linux-панель, она почти наверняка работает в **High Security Mode**. Это меняет формат HTTP-команды, которую монитор должен отправить на панель для открытия двери:

- **Старый формат:** `.../fcgi/do?action=OpenDoor...` (вероятно, не сработает).
- **Новый формат (для вашего кода):** `http://admin:password@IP_PANEL/fcgi/OpenDoor?action=OpenDoor&DoorNum=1`.
- **Что это значит для бэкенда:** Если вы захотите автоматизировать настройку монитора (Часть 3), вам нужно будет «запихивать» именно такой URL в настройки монитора через API или конфиг.

## **3. Где «упирается» автоматизация (согласно документу)**

Инструкция подтверждает, что настройка монитора — это отдельный процесс в его собственном веб-интерфейсе (`Phone > Relay > Remote Relay`).

- **Проблема:** В API мониторов (которые вы приложили ранее) методы для **записи** этих настроек (URL открытия двери, Label кнопки) часто отсутствуют или скрыты.
- **Вывод:** Ваш план «Вариант А» (ручная настройка монитора + автоматическая панель) — самый реалистичный. Вы настраиваете монитор один раз, указывая ему IP панели, а бэкенд управляет тем, чтобы панель знала номер монитора.

## **Итоговое резюме по вашему плану:**

1. **Бэкенд (Часть 1):** Добавляем `extension`. Это критически важно.
2. **Панель X912S (Часть 2):** Метод `/api/contact/add` с заполнением `Phone` (равным `extension`) заставит панель звонить.
3. **Монитор (Часть 3):** Используем вашу новую инструкцию. На мониторе вручную (или через XML-конфиг Auto-Provision) прописываем HTTP-команду открытия, используя IP панели X912S.
4. **Безопасность:** Не забудьте в X912S в разделе `Intercom > Relay > Open Relay via HTTP` поставить галочку **Enabled**, иначе команда от монитора будет игнорироваться.

**Ваш план теперь полностью закрывает цикл:**

1. Посетитель нажал кнопку (Панель знает `extension` из бэкенда).
2. Монитор зазвонил (Монитор понял, что это его `extension`).
3. Житель нажал «Открыть» (Монитор отправил HTTP-команду на панель, как в вашей инструкции).
4. Дверь открылась.

**Нужна ли помощь с написанием SQL-миграции для поля** `extension` **или доработкой Python-скрипта** `akuvox_config.py` **под новые поля?**

Ваш запрос

ГДЕ ТУТ ПРОПИСАТЬ АЙПИ ВЫЗЫВНОЙ ПАНЕЛИ

## Ответ Gemini

Согласно вашей инструкции "Open the Door via HTTP Command", IP-адрес вызывной панели **X912S** нужно прописать в настройках **внутреннего монитора** (indoor monitor).

## **Где именно это находится:**

1. Зайдите в веб-интерфейс **монитора** (не панели!).
2. Перейдите в раздел: **Phone > Relay > Remote Relay By HTTP or HTTPS**.
3. Там вы увидите список или кнопку **+Add**.
4. В поле **URL** или в строке настройки нужно прописать команду, которая будет "стучаться" на вашу панель.

---

## **Какой формат URL использовать для X912S?**

Так как X912S — современное устройство, на нем скорее всего включен **High Security Mode**. Поэтому используйте один из этих вариантов в поле URL на мониторе:

**Вариант 1 (Если на панели заданы логин/пароль для HTTP API):**

> `http://admin:password@192.168.1.100/fcgi/OpenDoor?action=OpenDoor&DoorNum=1`  
> *(Где* `192.168.1.100` *— это IP вашей вызывной панели X912S)*

**Вариант 2 (Если авторизация на панели не настроена):**

> `http://192.168.1.100/fcgi/OpenDoor?action=OpenDoor&DoorNum=1`

---

## **Что еще нужно проверить на самой панели (X912S):**

Чтобы команда от монитора сработала, на вызывной панели **X912S** должно быть разрешено принимать такие команды:

1. Зайдите в веб-интерфейс **панели**.
2. Путь: **Intercom > Relay > Open Relay via HTTP**.
3. Поставьте галочку **Enabled**.
4. Если вы используете Вариант 1 (с логином), впишите там те же **Username** и **Password**, которые вы указали в ссылке на мониторе.

## **Резюме для вашего плана:**

Когда вы будете автоматизировать создание квартир через бэкенд, вы пропишете в панели номера (extension), но чтобы кнопка "Открыть" на мониторе работала, вам нужно **один раз на каждом мониторе** прописать этот URL с IP-адресом вашей X912S.

**Хотите, я помогу составить точную строку URL, если вы скажете текущий IP вашей панели?**

## Ответ Gemini

Понял ваш вопрос. Чтобы кнопка «Открыть» заработала на мониторе, **IP вызывной панели X912S** нужно прописать в настройках **монитора** (Indoor Monitor).

Вот пошаговая инструкция, куда именно вводить данные в веб-интерфейсе монитора:

## **Шаг 1: Настройка связи на мониторе**

Зайдите в веб-интерфейс вашего внутреннего монитора и перейдите в раздел:  
**Phone** -> **Relay** -> **Remote Relay By HTTP or HTTPS**.

Именно в этой таблице создается связка. Пропишите следующие поля:

1. **IP / SIP Number:** Введите IP-адрес вашей панели X912S (например, `192.168.1.100`).
2. **HTTP URL:** Здесь нужно собрать команду. Для X912S (с включенным High Security Mode) формат такой:  
`http://192.168.1.100/fcgi/OpenDoor?action=OpenDoor&DoorNum=1`
3. **Username / Password:** Если на панели в разделе `Open Relay via HTTP` вы задали пароль, впишите его здесь.

---

## **Шаг 2: Создание кнопки на экране монитора**

Чтобы команда из Шага 1 появилась как кнопка во время звонка, спуститесь ниже в этом же разделе монитора:

- **Softkey in Talking Page** (Кнопка во время разговора)
- **Softkey In Monitor Page** (Кнопка в режиме просмотра камеры)

Выберите тип: **Remote Relay By HTTP or HTTPS** и укажите созданную ранее настройку.

---

## **Шаг 3: Важная настройка на панели X912S**

Если вы всё прописали на мониторе, но дверь не открывается, проверьте саму панель:

1. Зайдите в веб-интерфейс **X912S**.
2. Перейдите: **Intercom** -> **Relay** -> **Open Relay via HTTP**.
3. Убедитесь, что стоит галочка **Enabled**.
4. Параметр **Session Check** лучше **выключить** (как советует ваша инструкция), чтобы не было конфликтов безопасности при простых HTTP-запросах.

---

## **Итог для вашего бэкенд-плана:**

- **Бэкенд:** Автоматизирует список квартир на панели.
- **Ручная работа:** На каждом мониторе нужно один раз прописать этот IP адрес панели в `Remote Relay`.

**Почему это важно:** Монитор — это «клиент». Он должен знать «адрес сервера» (панели), чтобы отправить ему команду «открой реле №1». Если вы смените IP панели, кнопки на всех мониторах перестанут работать, пока вы не обновите этот IP в их настройках.


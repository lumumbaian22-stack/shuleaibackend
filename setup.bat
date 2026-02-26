@echo off

mkdir shuleai-backend
cd shuleai-backend

mkdir src
mkdir src\config
mkdir src\models
mkdir src\controllers
mkdir src\services
mkdir src\services\analytics
mkdir src\services\csv
mkdir src\middleware
mkdir src\routes
mkdir src\utils

type nul > src\config\database.js
type nul > src\config\auth.js
type nul > src\config\constants.js

type nul > src\models\index.js
type nul > src\models\User.js
type nul > src\models\School.js
type nul > src\models\Student.js
type nul > src\models\Teacher.js
type nul > src\models\Parent.js
type nul > src\models\Admin.js
type nul > src\models\AcademicRecord.js
type nul > src\models\Attendance.js
type nul > src\models\Fee.js
type nul > src\models\Payment.js
type nul > src\models\Message.js
type nul > src\models\Alert.js
type nul > src\models\ApprovalRequest.js
type nul > src\models\DutyRoster.js
type nul > src\models\UploadLog.js
type nul > src\models\SchoolNameRequest.js

type nul > src\controllers\authController.js
type nul > src\controllers\teacherSignupController.js
type nul > src\controllers\dutyController.js
type nul > src\controllers\adminController.js
type nul > src\controllers\teacherController.js
type nul > src\controllers\parentController.js
type nul > src\controllers\studentController.js
type nul > src\controllers\superAdminController.js
type nul > src\controllers\uploadController.js
type nul > src\controllers\analyticsController.js
type nul > src\controllers\publicController.js

type nul > src\services\notificationService.js
type nul > src\services\paymentService.js
type nul > src\services\analytics\curriculumEngine.js
type nul > src\services\csv\csvProcessor.js

type nul > src\middleware\auth.js
type nul > src\middleware\roles.js
type nul > src\middleware\validation.js

type nul > src\routes\authRoutes.js
type nul > src\routes\adminRoutes.js
type nul > src\routes\teacherRoutes.js
type nul > src\routes\parentRoutes.js
type nul > src\routes\studentRoutes.js
type nul > src\routes\dutyRoutes.js
type nul > src\routes\uploadRoutes.js
type nul > src\routes\analyticsRoutes.js
type nul > src\routes\superAdminRoutes.js
type nul > src\routes\publicRoutes.js

type nul > src\utils\helpers.js
type nul > src\utils\seed.js

type nul > src\app.js

type nul > .env
type nul > .env.example
type nul > package.json
type nul > server.js
type nul > README.md

echo Project structure created successfully!
pause
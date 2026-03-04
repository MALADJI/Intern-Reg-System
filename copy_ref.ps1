$refBase = "C:\Users\Admin\Desktop\Univen-intern-Register-frontend_2\Univen-intern-Register-frontend_2\Univen-intern-Register-frontend\src\app"
$targetBase = "src\app"

Copy-Item -Path "$refBase\intern\intern-dashboard\intern-dashboard.html" -Destination "$targetBase\intern\intern-dashboard\intern-dashboard.html" -Force
Copy-Item -Path "$refBase\intern\intern-dashboard\intern-dashboard.css" -Destination "$targetBase\intern\intern-dashboard\intern-dashboard.css" -Force
Copy-Item -Path "$refBase\supervisor\supervisor-dashboard\supervisor-dashboard.html" -Destination "$targetBase\supervisor\supervisor-dashboard\supervisor-dashboard.html" -Force
Copy-Item -Path "$refBase\supervisor\supervisor-dashboard\supervisor-dashboard.css" -Destination "$targetBase\supervisor\supervisor-dashboard\supervisor-dashboard.css" -Force

# Intern Register System

A comprehensive internship management system built with Spring Boot and Angular.

## 🚀 Features

- **User Authentication**: JWT-based authentication with role-based access control
- **User Roles**: Admin, Supervisor, and Intern roles with different permissions
- **Attendance Management**: Sign in/out with location tracking
- **Leave Request System**: Submit, approve, and reject leave requests
- **Reporting**: Generate PDF and Excel reports
- **Security**: Rate limiting, password validation, email verification

## 🛠️ Tech Stack

### Backend
- Spring Boot 3.5.7
- Java 17
- MySQL Database
- Spring Security with JWT
- Hibernate/JPA

### Frontend
- Angular 20
- Bootstrap 5
- RxJS

## 📋 Prerequisites

- Java 17 or higher
- MySQL 8.0 or higher
- Maven 3.6+
- Node.js and npm (for frontend)

## ⚙️ Setup Instructions

### Database Setup

1. Create MySQL database:
```sql
CREATE DATABASE internregister;
```

2. Copy `application.properties.template` to `application.properties`:
```bash
cp src/main/resources/application.properties.template src/main/resources/application.properties
```

3. Update `application.properties` with your database credentials:
```properties
spring.datasource.username=root
spring.datasource.password=YOUR_PASSWORD
```

### Backend Setup

1. Build the project:
```bash
./mvnw clean install
```

2. Run the application:
```bash
./mvnw spring-boot:run
```

The backend will start on `http://localhost:8082`

### Frontend Setup

Navigate to the frontend directory and follow the setup instructions there.

## 🔐 Default Users

After first startup, the system creates default users:

- **Admin**: `admin@univen.ac.za` / `admin123`
- **Supervisor**: `supervisor@univen.ac.za` / `supervisor123`
- **Intern**: `intern@univen.ac.za` / `intern123`

⚠️ **Change these passwords in production!**

## 📚 API Documentation

See `API_DOCUMENTATION.md` for complete API documentation.

See `POSTMAN_TEST_LINKS.md` for Postman collection and test links.

## 🔄 Database Reset

To reset the database for testing, see `RESET_DATABASE.md`.

## 📝 Project Structure

```
intern-register/
├── src/
│   ├── main/
│   │   ├── java/com/internregister/
│   │   │   ├── config/          # Configuration classes
│   │   │   ├── controller/      # REST controllers
│   │   │   ├── dto/             # Data Transfer Objects
│   │   │   ├── entity/          # JPA entities
│   │   │   ├── repository/      # JPA repositories
│   │   │   ├── security/       # Security configuration
│   │   │   └── service/         # Business logic
│   │   └── resources/
│   │       └── application.properties
│   └── test/
└── pom.xml
```

## 🧪 Testing

Run tests with:
```bash
./mvnw test
```

## 📄 License

This project is for educational purposes.

## 👥 Contributors
- Thabiso Maladji
- Kulani Baloyi
- Munyai Dzulani

## 📞 Support

For issues and questions, please open an issue on GitHub.


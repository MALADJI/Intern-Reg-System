PROPOSED REQUIREMENTS DOCUMENT
Project Research
Module Intern Register System
Author System Architect
Version Ver 1.0

Overview.
The University of Venda has initiated the execution of its strategic plan for 2021-2025. Strategic Objective 12, emphasizing automation and digitalization, has been pinpointed as a top priority by the ICT department, specifically the Business Systems division. As a result, the ICT department is committed to successfully executing Strategic Objective No. 12. This document outlines detailed business requirements to effectively tackle the suggested solution, encompassing functionalities related to the management of intern registration, daily attendance tracking, and leave management for the University of Venda.

2 | Page
Acronym:
ICT : Information Communication Technology
VC : Vice-chancellor and Principal
PIN : Personal Identification Number
EDRMS : Electronic Document Management Systems
DOB : Date of Birth
HEIs : Higher Education Institutions
DHET : Department of Higher Education and Technology
SA : South Africa
HR : Human Resources
API : Application Programming Interface
ITS : Enterprise Resource System name
GPS : Global Positioning System
JWT : JSON Web Token

Definitions:
System/ tool : Refers to the proposed Intern Register System solution,
Interns : Those who have to capture their daily attendance and leave,
Supervisors : Those who have the right to approve attendance and leave,
Users : Authorized officials to utilize the systems,
System Admin : Those who have administrative roles (HR/ICT),
System Owner : The Division/directorate regarded as the owner of the Systems (HR / Student Affairs),
Repository : A place where things are stored,
Integration : action that requires merging of two systems to share Resources,
Interface : Any functionality on the tool

3 | Page
1. Purpose:
The main objective of this document is to request approval from the Human Resources and Student Affairs department for the implementation or acquisition of a service provider that will automate the intern management process, thereby streamlining the submission of attendance records for stipend processing and reporting to internal stakeholders.

2. Objectives:
The primary aim of this document is to delineate the proposed solutions aimed at streamlining and reducing the workload faced by the Human Resources and supervisors, specifically in collecting and consolidating attendance registers (logbooks) to be submitted for payroll processing. In addition, we are currently in a digital era where most institutions have shifted from traditional practices to digitalization. Recognizing the potential benefits, the department has embraced the shift towards digitalization and is seizing the opportunities to modernize its business processes. As a result, the project seeks to automate the workflow by enabling interns to sign in/out digitally using geolocation verification. The objectives behind this solution are as follows:

o To transform from traditional paper logbooks into automation,
o To improve service delivery (timely stipend payments),
o To simplify administration (automated calculations),
o To eliminate errors (and fraudulent attendance claims),
o To generate required reports (monthly timesheets),
o To keep the records for future use (audit trails),
o To ease the process of reporting,

4 | Page
Ensuring high-quality service for all stakeholders at the University of Venda is paramount. This can be achieved by implementing efficient digital systems in intern management. As research representatives recommend, immediate action is necessary to streamline administrative processes. The Business Systems division also emphasized the importance of expediting the adoption of the new tool to address current challenges stakeholders face.

3. Background:
Based on comprehensive engagements with representatives from the Human Resources (HR) and Student Affairs departments, a critical business case was presented during the requirements gathering phase. These departments, which are responsible for the management and stipend processing of hundreds of university interns, expressed an urgent need for an electronic system to digitize the currently manual attendance tracking process.

The current system relies heavily on physical paper logbooks, where interns manually sign in and out daily. This traditional method has proven to be:
*   **Time-consuming**: HR staff spend days manually calculating hours from hundreds of logbooks to process monthly stipends.
*   **Ineffective**: Physical logbooks are often lost, damaged, or submitted late, delaying payments.
*   **Prone to Errors and Fraud**: The manual system is susceptible to "buddy punching" (signing in for a friend) and calculation errors, leading to financial discrepancies.
*   **Lacking Visibility**: Supervisors cannot monitor attendance in real-time, leading to "ghost workers" who claim stipends without being physically present.

In the current digital era, such inefficiencies are unsustainable. The transformation of these conventional methods into a fully automated digital solution is not just desired but necessary. This automation initiative aligns directly with the instructions of the Vice-Chancellor and Principal, as outlined in the University's Strategic Plan for 2021-2025. Specifically, **Strategic Objective No. 12** emphasizes the urgency of automation and digitalization of business processes to improve efficiency and governance. To ensure the provision and maintenance of quality services, all directorates, including HR and Student Affairs, are mandated to fulfill these strategic initiatives.

5 | Page
The Human Resources department is regarded as the system owner of the proposed tool, and they should support the proposal by signing the requirements document. The signature will serve as an agreement, allowing the ICT department to utilize the document as a formal mandate for providing a solution. It is important to note that the business system is responsible for facilitating meetings with relevant stakeholders, collecting and analyzing requirements, designing the proposed solution, documenting the requirements, communicating the needs to stakeholders, and ensuring that the system solution aligns with the scope of requirements.

The Business system will aid in evaluating the solution, regardless of the approach used to provide it, to ensure it aligns with the stakeholders' needs. Additionally, it will verify that comprehensive training has been conducted for all relevant users. Moreover, it is crucial to guarantee the completion of User acceptance testing and the final deployment to the production environment.

Furthermore, the data collected through stakeholder engagement revealed many issues that catalyze the projects. These issues encompass manual data entry, challenges in report generation, struggles with meeting payroll deadlines, monitoring and tracking absenteeism, obstacles in retrieving past data records, and overseeing intern progress.

In light of these triggers, this document serves as an official proposal to formally request that ICT offer the appropriate solution to tackle the challenges, subject to the required signatures.

6 | Page
4. User story:
The Human Resources and Student Affairs department requires a flexible online platform to enable interns and supervisors to efficiently collect attendance data, including daily sign-ins, sign-outs, and leave requests. This platform will streamline the reporting process for all stakeholders. The system should be able to capture and generate reports based on the selected criteria (e.g., monthly attendance). Additionally, it should be able to create individual reports that adhere to University templates. Furthermore, the system must be able to auto-calculate hours worked based on the information provided but in line with labor guidelines.

5. FUNCTIONALITY REQUIREMENTS
The diagrams and captions will be used to demonstrate the functionality. The diagrams will visually represent the flow of the process, while the business rules will be presented in the form of captions.

7 | Page
5.1. Business Rules:
• The system should be web-based and mobile-responsive,
• Only authorized officials (Interns, Supervisors, Admins) will utilize the system,
• Once the officials successfully log into the portal, the profile of such staff should be auto-loaded and allowed to perform authorized functions depending on the roles assigned to them,
• The interns should be able to capture the data (attendance/leave) and supervisors should extract the report based on the rights provided to them,
• During the process of capturing, the system should be able to auto-calculate some fields (hours worked) based on the information captured,
• The system should be capable of integration with the ITS system, in-house developed, and any other third-party systems.
• Reports will be only generated by dedicated officials from the Department.

5.2. Various Interfaces:
5.2.1. User Interface
(a) Login Interface:
- The user will utilize credentials to log in through this interface.
Fields to be used:
Username (Email) : Text Input
Password : Password Input

8 | Page
(b) Intern's Interface (Student/Graduate)
The intern interface is designed to enable interns to input information regarding daily attendance and leave applications into the systems.

1. Attendance (Logbook) Fields:
- Users can utilize this interface to sign in and sign out daily.
- Attendance Details:
Date : Auto-generation of System Date
Time In : Auto-generation of System Time
Time Out : Auto-generation of System Time
Location : Auto-detected (GPS Coordinates)
Site Name : Selection/Auto-detected (e.g., Main Campus)
Status : Auto-calc (Present/Absent/Late)
Digital Signature : Canvas input (Drawing)

- Intern's Profile (Auto-loaded):
Student/Employee No : Number to input
Surname : Auto-input
Initials : Auto-input
First-Names : Auto-input
Gender : Auto-input
Population Group : Auto-input
DOB : Auto-input
Department : Auto-input
Supervisor : Auto-input
Contract Valid Until : Date (Auto-input)

- Units/Calculations:
Hours Worked : Auto Calc (Time Out - Time In)
Days Worked : Auto Calc (Count of attendance records)
Additional Comments : Text Input (not mandatory)

9 | Page
2. Leave Management:
Leave Type : Selection (Sick, Study, Annual, Family)
Start Date : Date selection (yyyy-mm-dd)
End Date : Date selection (yyyy-mm-dd)
Total Days : Auto Calc
Reason : Text to input
Attachment : File Upload (Medical Certificate etc.)
Status : Auto-populated (Pending/Approved/Declined)

- Claiming Intern:
Student/Employee No : Number to input
Surname : Auto populated
Initials : Auto populated
First Names : Auto populated
Department : Auto populated
Supervisor : Auto populated

(c) Supervisor's Interface:
- The supervisor is an authorized official responsible for interns.
- The supervisor can view all captured information, approve/decline attendance and leave, and correct where necessary.
Fields to be used:
Full Names : Auto-populate
Surname : Auto-populate
Department : Auto-populate
Options : View Interns, Approve Attendance, Approve Leave

1. Approval Actions:
Select Record : Checkbox
Action : Button (Approve / Decline)
Comment : Text Input (Reason for decline)

(d) Administrator interface:
- The administrator is an authorized official from HR or ICT.
- The administrator can upload, modify, and remove all the predefined data (Departments, Locations).
- The administrator can generate reports from the system.

Fields to be used:
Options : Manage Users, Manage Departments, Run Reports

Run Reports:
Filter : Selection (Department, Month, Year)
Output : Selection (Pre-defined PDF or Excel format)
Run : Button (to generate a report)
Cancel : Button (to cancel a report)

5.2.2. Integration interface:
(a) ITS integration
-The system should extract HR information from ITS for-login purposes.
(b) ERDM integration
-The system should also be able to store information on the ERDM repository for future use.

6. Process flow and sequence diagrams
6.1. Process flow for Intern Register System.
17 | Page
[Figure 1: Process flow for Intern Register Systems - Placeholder]

6.2 Sequence Diagrams for Intern Register System.
18 | Page
[Figure 2: Sequence diagram to illustrate Intern Register Systems - Placeholder]

6.3 Use case diagram for Intern Register Systems:
19 | Page
[Figure 3: Use a case diagram to illustrate the Intern Register systems - Placeholder]

7. Extraction of Reports
Only authorized officials should be given the privilege to generate a report based on their level of position and responsibilities.
Reports include:
- Monthly Timesheets (PDF)
- Departmental Attendance Summary (Excel)
- Leave Balances Report

8. Integration
• Integration with ITS and ERDM is required for this solution.
• HR pre-defined information will be constantly loaded to improve the systems' performance or behavior.

20 | Page
9. Recommendation
To implement the proposed solution, we appeal to the system owner to peruse the document and give advice where necessary. This document is designed based on the requirements gathered and is meant to respond to the required concept. Subsequently, we recommend that the owner of the project sign the document as a formal way of satisfaction or agreement with the proposed solution. Signing the requirements document will expedite the development or implementation process, as development is an iterative process that depends on the completion of the previous process.

10. Conclusion
In conclusion, we appeal to the system owner to append the signatures to initiate the development process. We also want to clarify that the delay in appending signatures will affect the implementation as priority and preferences are given based on the signed documents.

11. SIGNATORIES
System Owner Representative (HR/Student Affairs):
APPROVED AMENDED NOT APPROVED
_______________________________________ ______________________________
Full Names Signature
__________________________________________
Position

21 | Page
__________________________________________
Date

Witness:
______________________________________ ______________________________
Full Names Signature
_____________________________________
Date

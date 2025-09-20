---
author: wdlin
pubDatetime: 2025-09-20T16:25:00
modDatetime: 2025-09-20T16:50:00
title: The Relational Algebra Learning Notes
slug: RelationalAlgebra
featured: false
draft: false
tags:
  - DB
  - RelationalAlgebra
description:
  The Relational Algebra learning notes for the database course.
---

## Table of contents

## Introduction

Relational algebra is a procedural query language that works on relations (tables) and produces relations as a result. It's a fundamental concept in database theory, providing a theoretical foundation for SQL and other database query languages. It consists of a set of operations that take one or two relations as input and produce a new relation.

## Data Operations

**1. `Students` Relation**

| StudentID | Name     | Major        |
| :-------- | :------- | :----------- |
| 101       | Alice    | Computer Sci |
| 102       | Bob      | Mathematics  |
| 103       | Charlie  | Computer Sci |
| 104       | David    | Physics      |

**2. `Enrollment` Relation**

| StudentID | CourseID | Grade |
| :-------- | :------- | :---- |
| 101       | CS101    | A     |
| 101       | MA101    | B+    |
| 102       | CS101    | B     |
| 103       | PH101    | C     |
| 104       | MA101    | A-    |

### 1. Selection ($\sigma$)

The selection operation selects tuples (rows) from a relation that satisfy a given condition.

*   **Notation**: $\sigma_{condition}(R)$
*   **Example**: Find all students majoring in 'Computer Sci'.

    $\sigma_{\text{Major = 'Computer Sci'}}(\text{Students})$

    **Result:**

    | StudentID | Name    | Major        |
    | :-------- | :------ | :----------- |
    | 101       | Alice   | Computer Sci |
    | 103       | Charlie | Computer Sci |

### 2. Projection ($\Pi$)

The projection operation selects specified attributes (columns) from a relation, removing duplicate tuples in the result.

*   **Notation**: $\pi_{A1, A2, ..., An}(R)$
*   **Example**: Get the names and majors of all students.

    $\pi_{\text{Name, Major}}(\text{Students})$

    **Result:**

    | Name    | Major        |
    | :------ | :----------- |
    | Alice   | Computer Sci |
    | Bob     | Mathematics  |
    | Charlie | Computer Sci |
    | David   | Physics      |

### 3. Union ($\cup$)

The union operation combines two relations that have the same number of attributes and compatible domains (schema). 

It produces a relation containing all tuples that are in either of the original relations, removing duplicates.

*   **Notation**: $R \cup S$
*   **Example**: 

    A example for union would be if we had two lists of students from different sources that we wanted to combine.

    Creating a temporary relation for demonstration:
    `HonorsStudents` (StudentID, Name, Major)
    | StudentID | Name  | Major        |
    | :-------- | :---- | :----------- |
    | 101       | Alice | Computer Sci |
    | 105       | Eve   | Biology      |

    $\Pi_{\text{StudentID, Name, Major}}(\sigma_{\text{Major = 'Computer Sci'}}(\text{Students})) \cup \Pi_{\text{StudentID, Name, Major}}(\text{HonorsStudents})$

    **Result:**

    | StudentID | Name    | Major        |
    | :-------- | :------ | :----------- |
    | 101       | Alice   | Computer Sci |
    | 103       | Charlie | Computer Sci |
    | 105       | Eve     | Biology      |

### 4. Intersection ($\cap$)

The intersection operation produces a relation containing all tuples that are common to both relations. Both relations must have the same schema.

*   **Notation**: $R \cap S$
*   **Example**: Find students who are *both* in `Students` (from our original table) *and* in the `HonorsStudents` temporary table.

    $\Pi_{\text{StudentID, Name, Major}}(\text{Students}) \cap \Pi_{\text{StudentID, Name, Major}}(\text{HonorsStudents})$

    **Result:**

    | StudentID | Name  | Major        |
    | :-------- | :---- | :----------- |
    | 101       | Alice | Computer Sci |

### 5. Set Difference ($-$)

The set difference operation produces a relation containing all tuples that are in the first relation but *not* in the second relation. Both relations must have the same schema.

*   **Notation**: $R - S = { t \in R \vee t \notin S }$ 
*   **Example**: Find students who are in the `Students` table but *not* in the `HonorsStudents` table.

    $\Pi_{\text{StudentID, Name, Major}}(\text{Students}) - \Pi_{\text{StudentID, Name, Major}}(\text{HonorsStudents})$

    **Result:**

    | StudentID | Name    | Major       |
    | :-------- | :------ | :---------- |
    | 102       | Bob     | Mathematics |
    | 103       | Charlie | Computer Sci|
    | 104       | David   | Physics     |

### 6. Cartesian Product ($\times$)

Also known as Cross Join, this operation combines **every** tuple from the first relation with **every** tuple from the second relation. 

If relation R has 'm' tuples and S has 'n' tuples, the result will have **'m * n'** tuples. The schema of the result is the concatenation of the schemas of the two relations.

*   **Notation**: $R \times S = { (t, q) | t \in R \vee q \in S }$
*   **Example**: Combine `Students` and `Enrollment`. (This usually produces a large, often meaningless, intermediate result without a subsequent selection for joining).

    $\text{Students} \times \text{Enrollment}$

    **Result (partial, would be 4 * 5 = 20 rows):**

    | Students.StudentID | Name     | Major        | Enrollment.StudentID | CourseID | Grade |
    | :-------- | :------- | :----------- | :-------- | :------- | :---- |
    | 101       | Alice    | Computer Sci | 101       | CS101    | A     |
    | 101       | Alice    | Computer Sci | 101       | MA101    | B+    |
    | 101       | Alice    | Computer Sci | 102       | CS101    | B     |
    | 101       | Alice    | Computer Sci | 103       | PH101    | C     |
    | 101       | Alice    | Computer Sci | 104       | MA101    | A-    |
    | ...       | ...      | ...          | ...       | ...      | ...   |
    | 104       | David    | Physics      | 104       | MA101    | A-    |

### 7. Join ($\bowtie$)

The join operation combines tuples from two relations based on a common attribute or a join condition. The most common type is the **Natural Join**.

*   **Natural Join Notation**: $R \bowtie S = { (t, q) | t \in R \vee q \in S \vee p(t, q) = True }$

    This joins relations `R` and `S` on all common attributes, taking only one instance of each common attribute in the result.

*   **Example**: Find the name and major of students along with the courses they are enrolled in and their grades.

    $\text{Students} \bowtie \text{Enrollment}$

    **Result:**

    | StudentID | Name    | Major        | CourseID | Grade |
    | :-------- | :------ | :----------- | :------- | :---- |
    | 101       | Alice   | Computer Sci | CS101    | A     |
    | 101       | Alice   | Computer Sci | MA101    | B+    |
    | 102       | Bob     | Mathematics  | CS101    | B     |
    | 103       | Charlie | Computer Sci | PH101    | C     |
    | 104       | David   | Physics      | MA101    | A-    |

***

While the natural join (or inner join) only returns tuples that have matches in *both* relations, outer joins are designed to include tuples that might not have a match in the other relation, filling in `NULL` values where no match exists. 


**1. `Students` Relation**

| StudentID | Name | Major |
| :-------- | :--- | :----------- |
| 101 | Alice | Computer Sci |
| 102 | Bob | Mathematics |
| 103 | Charlie | Computer Sci |
| 104 | David | Physics |
| **105** | **Eve** | **Art** | (New student, not currently in `Enrollment`)

**2. `Enrollment` Relation**

| StudentID | CourseID | Grade |
| :-------- | :------- | :---- |
| 101 | CS101 | A |
| 101 | MA101 | B+ |
| 102 | CS101 | B |
| 103 | PH101 | C |
| 104 | MA101 | A- |
| **106** | **AR101** | **A** | (New enrollment, no matching student in `Students`)
| 101 | PH101 | B- |

#### 7a. Left Outer Join ($\text{⟕}$)

The Left Outer Join returns all tuples from the *left* relation and the matching tuples from the *right* relation. If a tuple in the left relation has *no matching tuple* in the right relation, the attributes from the right relation will be filled with `NULL` values.

*   **Notation**: $R \text{⟕} S$
*   **Example**: Show all students and, if they are enrolled in any courses, show their enrollment details. Students without enrollment should still appear.

    $\text{Students} \text{⟕} \text{Enrollment}$

    **Result:**

    | StudentID | Name | Major | CourseID | Grade |
    | :-------- | :--- | :----------- | :------- | :---- |
    | 101 | Alice | Computer Sci | CS101 | A |
    | 101 | Alice | Computer Sci | MA101 | B+ |
    | 102 | Bob | Mathematics | CS101 | B |
    | 103 | Charlie | Computer Sci | PH101 | C |
    | 104 | David | Physics | MA101 | A- |
    | 101 | Alice | Computer Sci | PH101 | B- |
    | **105** | **Eve** | **Art** | **NULL** | **NULL** |

#### 7b. Right Outer Join ($\text{⟖}$)

The Right Outer Join returns all tuples from the *right* relation and the matching tuples from the *left* relation. If a tuple in the right relation has *no matching tuple* in the left relation, the attributes from the left relation will be filled with `NULL` values.

*   **Notation**: $R \text{⟖} S$
*   **Example**: Show all enrollments and, if they correspond to an existing student, show the student's name and major. Enrollments by non-existent students should still appear.

    $\text{Students} \text{⟖} \text{Enrollment}$

    **Result:**

    | StudentID | Name | Major | CourseID | Grade |
    | :-------- | :--- | :----------- | :------- | :---- |
    | 101 | Alice | Computer Sci | CS101 | A |
    | 101 | Alice | Computer Sci | MA101 | B+ |
    | 102 | Bob | Mathematics | CS101 | B |
    | 103 | Charlie | Computer Sci | PH101 | C |
    | 104 | David | Physics | MA101 | A- |
    | 101 | Alice | Computer Sci | PH101 | B- |
    | **106** | **NULL** | **NULL** | **AR101** | **A** | <- Enrollment for 106 appears, as it's in `Enrollment`

#### 7c. Full Outer Join ($\text{⟗}$)

The Full Outer Join returns all tuples from *both* the left and right relations. If a tuple in the left relation has no match in the right, or vice versa, the non-matching attributes will be filled with `NULL` values. It's essentially the union of a Left Outer Join and a Right Outer Join.

*   **Notation**: $R \text{⟗} S$
*   **Example**: Show all students and all enrollments. If a student has no enrollment, show their details with `NULL` for enrollment. If an enrollment has no matching student, show its details with `NULL` for student information.

    $\text{Students} \text{⟗} \text{Enrollment}$

    **Result:**

    | StudentID | Name | Major | CourseID | Grade |
    | :-------- | :--- | :----------- | :------- | :---- |
    | 101 | Alice | Computer Sci | CS101 | A |
    | 101 | Alice | Computer Sci | MA101 | B+ |
    | 102 | Bob | Mathematics | CS101 | B |
    | 103 | Charlie | Computer Sci | PH101 | C |
    | 104 | David | Physics | MA101 | A- |
    | 101 | Alice | Computer Sci | PH101 | B- |
    | **105** | **Eve** | **Art** | **NULL** | **NULL** | <- Eve (from `Students` only)
    | **106** | **NULL** | **NULL** | **AR101** | **A** | <- Enrollment 106 (from `Enrollment` only)

### 8. Rename ($\rho$)

The rename operation is used to rename a relation or an attribute within a relation. This is useful for making expressions clearer or for distinguishing between attributes that have the same name in a join.

*   **Notation**: $\rho_{S(B_1, B_2, ..., B_n)}(R)$ renames relation `R` to `S` and its attributes to $B_1, ..., B_n$.
    $\rho_{S}(R)$ renames relation `R` to `S`, keeping attribute names.
    $\rho_{A \to B}(R)$ renames attribute `A` to `B` in relation `R`.

*   **Example 1 (Rename Relation)**: Rename the `Students` relation to `Undergraduates`.

    $\rho_{\text{Undergraduates}}(\text{Students})$

    **Result (same data, new relation name):** `Undergraduates` relation with `StudentID`, `Name`, `Major`.

*   **Example 2 (Rename Attribute)**: Rename `StudentID` to `Student_ID` in the `Students` relation.

    $\rho_{\text{StudentID} \to \text{Student\_ID}}(\text{Students})$

    **Result:**

    | Student\_ID | Name    | Major        |
    | :---------- | :------ | :----------- |
    | 101         | Alice   | Computer Sci |
    | 102         | Bob     | Mathematics  |
    | 103         | Charlie | Computer Sci |
    | 104         | David   | Physics      |

### 9. Assignment ($\leftarrow$ or $:= $)

The assignment operation allows you to store the result of a relational algebra expression into a new temporary relation variable. This is not a fundamental operation that produces a new *type* of result, but rather a way to break down complex queries into smaller, manageable steps and store intermediate results.

*   **Notation**: `TempRelation <- Expression`
*   **Example**: Find all students who are enrolled in `CS101` and store this result in a new relation called `CS101_Students`.

    $\text{CS101\_Enrollment} \leftarrow \sigma_{\text{CourseID = 'CS101'}}(\text{Enrollment})$

    **Intermediate Result (`CS101_Enrollment`):**

    | StudentID | CourseID | Grade |
    | :-------- | :------- | :---- |
    | 101 | CS101 | A |
    | 102 | CS101 | B |

    You can then use `CS101_Enrollment` in subsequent operations:

    $\Pi_{\text{Name}}(\text{Students} \bowtie \text{CS101\_Enrollment})$

    **Final Result (Names of students in CS101):**

    | Name |
    | :--- |
    | Alice |
    | Bob |

### 10. Division ($\div$)

The division operation is used when you want to find tuples in one relation that are related to *all* tuples in another relation. It's often described as finding "A divided by B," where A is a relation with attributes $R_1 \cup R_2$ and B is a relation with attributes $R_2$. The result contains attributes $R_1$ for which the corresponding $R_2$ values exist in A for *every* tuple in B.

This operation is particularly useful for "for all" type queries, such as "Find students who have taken *all* required courses."

*   **Notation**: $R \div S$

*   **Example**: Find the `StudentID`s of students who have taken *all* courses listed in `RequiredCourses` (查找 R 中所有选择 S 的学生).

    Here:
    *   $R$ is our `Enrollment` relation, with attributes `StudentID` (A) and `CourseID` (B).
    *   $S$ is our `RequiredCourses` relation, with attribute `CourseID` (B).

    $\Pi_{\text{StudentID, CourseID}}(\text{Enrollment}) \div \Pi_{\text{CourseID}}(\text{RequiredCourses})$

    Let's trace this:

    1.  **`Enrollment` (R):**
        | StudentID | CourseID | Grade |
        | :-------- | :------- | :---- |
        | 101 | CS101 | A |
        | 101 | MA101 | B+ |
        | 102 | CS101 | B |
        | 103 | PH101 | C |
        | 104 | MA101 | A- |
        | 101 | PH101 | B- |

    2.  **$\Pi_{\text{StudentID, CourseID}}(\text{Enrollment})$ (R' - our actual R for division):**
        | StudentID | CourseID |
        | :-------- | :------- |
        | **101** | CS101 |
        | **101** | MA101 |
        | 102 | CS101 |
        | 103 | PH101 |
        | 104 | MA101 |
        | 101 | PH101 |

    3.  **`RequiredCourses` (S):**
        | CourseID |
        | :------- |
        | CS101 |
        | MA101 |

    Now, we look for `StudentID`s in `R'` such that for *each* `CourseID` in `S` (CS101 and MA101), that `StudentID` is paired with that `CourseID` in `R'`.

    *   **Student 101:** Has (101, CS101), (101, MA101), (101, PH101). Since (101, CS101) and (101, MA101) exist, Student 101 has taken *all* required courses.
    *   **Student 102:** Has (102, CS101). Does *not* have (102, MA101). So, 102 is excluded.
    *   **Student 103:** Has (103, PH101). Does *not* have (103, CS101) or (103, MA101). Excluded.
    *   **Student 104:** Has (104, MA101). Does *not* have (104, CS101). Excluded.

    **Result of Division:**

    | StudentID |
    | :-------- |
    | 101 |

The division operation is powerful for specific types of "universal quantification" queries. While not as frequently used directly in SQL as other operations, its logic is crucial for understanding how certain complex SQL queries (often involving nested subqueries with `NOT EXISTS` or `COUNT` and `GROUP BY`) are constructed.

## Exercises

### Exercise1

For table schemas S(Students), C(Courses) and SC(Student-Course Enrollment):

| S# | SNAME | AGE | SEX |
| :-------- | :------- | :---- | :---- |
| 1 | Qiang Li | 23 | M |
| 2 | Li Liu | 22 | F |
| 5 | You Zhang | 22 | M |

| C# | CNAME | TEACHER |
| :-------- | :------- | :---- |
| k1 | C Programming Language | Hua Wang |
| k5 | Database Principle | Jun Cheng |
| k8 | Compiler Principle | Jun Cheng |

| S# | C# | GRADE |
| :-------- | :------- | :---- |
| 1 | k1 | 83 |
| 2 | k1 | 85 |
| 5 | k1 | 92 |
| 2 | k5 | 90 |
| 5 | k5 | 84 |
| 5 | k8 | 80 |

**(1) Retrieve the Course ID (C#) and Course Name (CNAME) of courses taught by Jun Cheng.**

$\Pi_{\text{C\#, CNAME}}(\sigma_{\text{TEACHER = 'Jun Cheng'}}(\text{C}))$

**(2) Retrieve the Student ID (S#) and Name (SNAME) of male students older than 21.**

$\Pi_{\text{S\#, SNAME}}(\sigma_{\text{AGE > 21 ∧ SEX = 'M'}}(\text{S}))$

**(3) Retrieve the names (SNAME) of students who have taken *all* courses taught by Jun Cheng.**

1.  Find all Course IDs taught by Jun Cheng:
    $R_1 \leftarrow \Pi_{\text{C\#}}(\sigma_{\text{TEACHER = 'Jun Cheng'}}(\text{C}))$
2.  Find all (S#, C#) pairs from enrollment:
    $R_2 \leftarrow \Pi_{\text{S\#, C\#}}(\text{SC})$
3.  Divide student-course pairs by courses taught by 'Jun Cheng' to find S# of students who took all of them:
    $R_3 \leftarrow R_2 \div R_1$
4.  Join with Students to get their names:
    $\Pi_{\text{SNAME}}(\text{S} \bowtie R_3)$

**(4) Retrieve the Course IDs (C#) of courses *not* taken by student Qiang Li.**

1.  Find the S# of 'Qiang Li':
    $R_1 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{SNAME = 'Qiang Li'}}(\text{S}))$
2.  Find Course IDs taken by 'Qiang Li':
    $R_2 \leftarrow \Pi_{\text{C\#}}(\text{SC} \bowtie R_1)$
3.  Find all distinct Course IDs available:
    $R_3 \leftarrow \Pi_{\text{C\#}}(\text{C})$
4.  Subtract courses taken by 'Qiang Li' from all available courses:
    $R_3 - R_2$

**(5) Retrieve the Course IDs (C#) of courses that have been selected by at least two students.**

1.  Rename `SC` to allow self-join and distinguish student IDs:
    $SC_1 \leftarrow \rho_{\text{SC}_{1}}(\text{SC})$, 
    $SC_2 \leftarrow \rho_{\text{SC}_{2}(\text{S\#}_2, \text{C\#}_2, \text{GRADE}_2)}(\text{SC})$
2.  Join `SC_1` and `SC_2` on matching `C#` but different `S#`:
    $\Pi_{\text{C\#}}(\sigma_{\text{SC}_1.\text{C\#} = \text{SC}_2.\text{C\#} \text{ ∧ } \text{SC}_1.\text{S\#} \neq \text{SC}_2.\text{S\#}}(\text{SC}_1 \times \text{SC}_2))$

**(6) Retrieve the Course IDs (C#) and Course Names (CNAME) of courses that *all* students have taken.**

1.  Find all distinct Student IDs:
    $R_1 \leftarrow \Pi_{\text{S\#}}(\text{S})$
2.  Find all (C#, S#) pairs from enrollment:
    $R_2 \leftarrow \Pi_{\text{C\#, S\#}}(\text{SC})$
3.  Divide course-student pairs by all students to find C# of courses taken by all students:
    $R_3 \leftarrow R_2 \div R_1$
4.  Join with Courses to get their names:
    $\Pi_{\text{C\#, CNAME}}(\text{C} \bowtie R_3)$

**(7) Retrieve the Student IDs (S#) of students who have taken *at least one* course taught by "Jun Cheng".**

1.  Find the Course IDs of courses taught by 'Jun Cheng':
    $R_1 \leftarrow \Pi_{\text{C\#}}(\sigma_{\text{TEACHER = 'Jun Cheng'}}(\text{C}))$
2.  Join `SC` with `R_1` on `C#` and project `S#`:
    $\Pi_{\text{S\#}}(\text{SC} \bowtie R_1)$

**(8) Retrieve the Student IDs (S#) of students who have taken Course 'k1' *and* Course 'k5'.**

1.  Find S# of students who took 'k1':
    $R_1 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{C\# = 'k1'}}(\text{SC}))$
2.  Find S# of students who took 'k5':
    $R_2 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{C\# = 'k5'}}(\text{SC}))$
3.  Take the intersection of these two sets of S#:
    $R_1 \cap R_2$

**(9) Retrieve the Student Names (SNAME) of students who have taken *all* available courses.**

1.  Find all distinct Course IDs:
    $R_1 \leftarrow \Pi_{\text{C\#}}(\text{C})$
2.  Find all (S#, C#) pairs from enrollment:
    $R_2 \leftarrow \Pi_{\text{S\#, C\#}}(\text{SC})$
3.  Divide student-course pairs by all courses to find S# of students who took all of them:
    $R_3 \leftarrow R_2 \div R_1$
4.  Join with Students to get their names:
    $\Pi_{\text{SNAME}}(\text{S} \bowtie R_3)$

**(10) Retrieve the Student IDs (S#) of students who have taken *at least one of* the courses taken by student '2'.**

1.  Find Course IDs taken by student '2':
    $R_1 \leftarrow \Pi_{\text{C\#}}(\sigma_{\text{S\# = 2}}(\text{SC}))$
2.  Join `SC` with `R_1` on `C#` and project `S#`:
    $\Pi_{\text{S\#}}(\text{SC} \bowtie R_1)$

**(11) Retrieve the Student IDs (S#) and Names (SNAME) of students who have taken the course named "C Programming Language".**

1.  Find the C# for 'C Programming Language':
    $R_1 \leftarrow \Pi_{\text{C\#}}(\sigma_{\text{CNAME = 'C Programming Language'}}(\text{C}))$
2.  Join `SC` with `R_1` to find enrollments for 'C Programming Language':
    $R_2 \leftarrow \text{SC} \bowtie R_1$
3.  Join `R_2` with `S` to get student details and project S# and SNAME:
    $\Pi_{\text{S\#, SNAME}}(\text{S} \bowtie R_2)$

**(12) Retrieve the Student IDs (S#) and Names (SNAME) of students who have *not failed any course* (assuming a failing grade is GRADE <= 60).**

1.  Find the S# of students who have failed at least one course:
    $R_1 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{GRADE <= 60}}(\text{SC}))$
2.  Find all distinct S# from the Students table:
    $R_2 \leftarrow \Pi_{\text{S\#}}(\text{S})$
3.  Subtract students who failed from all students to get those who haven't failed:
    $R_3 \leftarrow R_2 - R_1$
4.  Join with Students to get their names:
    $\Pi_{\text{S\#, SNAME}}(\text{S} \bowtie R_3)$

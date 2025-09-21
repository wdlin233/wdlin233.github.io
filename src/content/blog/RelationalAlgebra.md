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

### 11. Group/Aggregation ($\mathcal{G}$)

The Group/Aggregation operation (often represented as $\mathcal{G}$ or gamma) is an extension to basic relational algebra that allows for grouping tuples based on common attribute values and then applying aggregate functions (like COUNT, SUM, AVG, MAX, MIN) to each group. It is crucial for summarizing data.

*   **Notation**: $G_{A_1, A_2, ..., A_k; F_1(B_1), F_2(B_2), ... F_m(B_m)}(R)$
    *   $A_1, A_2, ..., A_k$: These are the grouping attributes. The relation $R$ will be partitioned into groups based on unique combinations of values in these attributes. If no grouping attributes are specified, the entire relation is treated as a single group.
    *   $F_i(B_i)$: These are the aggregate functions applied to attributes $B_i$ within each group. Common aggregate functions include:
        *   COUNT: Counts the number of tuples.
        *   SUM: Calculates the sum of values.
        *   AVG: Calculates the average of values.
        *   MAX: Finds the maximum value.
        *   MIN: Finds the minimum value.

*   **Example 1: Counting Enrollments per Student**
    Using our `Enrollment` relation:

    | StudentID | CourseID | Grade |
    | :-------- | :------- | :---- |
    | 101 | CS101 | A |
    | 101 | MA101 | B+ |
    | 102 | CS101 | B |
    | 103 | PH101 | C |
    | 104 | MA101 | A- |
    | 101 | PH101 | B- |

    **Goal**: Count how many courses each student is enrolled in.

    $\mathcal{G}_{\text{StudentID}; \text{COUNT(CourseID) AS NumCourses}}(\text{Enrollment})$

    **Result:**

    | StudentID | NumCourses |
    | :-------- | :--------- |
    | 101 | 3 |
    | 102 | 1 |
    | 103 | 1 |
    | 104 | 1 |

*   **Example 2: Average Grade per Student**
    **Goal**: Calculate the average grade for each student.

    $\mathcal{G}_{\text{StudentID}; \text{AVG(Grade) AS AverageGrade}}(\text{Enrollment})$

    **Result (assuming A=4, B+=3.5, B=3, C=2, A-=3.7, B-=2.5 for calculation):**

    | StudentID | AverageGrade |
    | :-------- | :----------- |
    | 101 | (4 + 3.5 + 2.5) / 3 = 3.33 |
    | 102 | 3 / 1 = 3 |
    | 103 | 2 / 1 = 2 |
    | 104 | 3.7 / 1 = 3.7 |

    *(Note: The actual `Grade` column contains letter grades, so `AVG(Grade)` as a numerical average might not be directly applicable without a mapping function from letter grades to numbers. For demonstration, we assume such a mapping exists or that `Grade` could be numerical.)*

The Aggregation operator is a powerful tool for generating summary reports and answering analytical questions about the data, forming the basis for `GROUP BY` and aggregate functions in SQL.

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

### Exercises2

For Database Schema:

*   **Students (S):** (S#, SNAME, SEX, MAJOR, SCHOLARSHIP)
*   **Courses (C):** (C#, CNAME, CREDIT)
*   **Learning (L):** (S#, C#, SCORE)

**(1) Retrieve information for students majoring in "English", including Student ID (S#), Name (SNAME), Course Name (CNAME), and Score (SCORE).**

1.  Select students majoring in 'English':
    $R_1 \leftarrow \sigma_{\text{MAJOR = 'English'}}(\text{Students})$
2.  Join with Learning to get their course scores:
    $R_2 \leftarrow R_1 \bowtie \text{Learning}$
3.  Join with Courses to get course names:
    $R_3 \leftarrow R_2 \bowtie \text{Courses}$
4.  Project the required attributes:
    $\Pi_{\text{S\#, SNAME, CNAME, SCORE}}(R_3)$

**(2) Retrieve Student ID (S#), Name (SNAME), Major (MAJOR), and Score (SCORE) for all students whose 'Database Principles' course score is greater than 90.**

1.  Select the 'Database Principles' course:
    $R_1 \leftarrow \sigma_{\text{CNAME = 'Database Principles'}}(\text{Courses})$
2.  Join with Learning to find students who took this course and their scores:
    $R_2 \leftarrow R_1 \bowtie \text{Learning}$
3.  Filter for scores greater than 90:
    $R_3 \leftarrow \sigma_{\text{SCORE > 90}}(R_2)$
4.  Join with Students to get student details:
    $R_4 \leftarrow R_3 \bowtie \text{Students}$
5.  Project the required attributes:
    $\pi_{\text{S\#, SNAME, MAJOR, SCORE}}(R_4)$

**(3) Retrieve Student ID (S#), Name (SNAME), and Major (MAJOR) for students who did *not* take course 'C135'.**

1.  Find Student IDs (S#) of students who *did* take course 'C135':
    $R_1 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{C\# = 'C135'}}(\text{Learning}))$
2.  Find all distinct Student IDs (S#) from the Students table:
    $R_2 \leftarrow \Pi_{\text{S\#}}(\text{Students})$
3.  Subtract students who took 'C135' from all students to find those who didn't:
    $R_3 \leftarrow R_2 - R_1$
4.  Join with Students to get their names and majors:
    $\Pi_{\text{S\#, SNAME, MAJOR}}(\text{Students} \bowtie R_3)$

**4. Retrieve the information (Student ID (S#), Name (SNAME), and Major (MAJOR)) of all students who *did not fail any course* (assuming a failing grade is SCORE < 60).**

1.  Find the S# of students who *have failed* at least one course (SCORE < 60):
    $R_1 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{SCORE < 60}}(\text{Learning}))$
2.  Find all distinct S# from the `Students` table:
    $R_2 \leftarrow \Pi_{\text{S\#}}(\text{Students})$
3.  Subtract students who failed from all students:
    $R_3 \leftarrow R_2 - R_1$
4.  Join with the `Students` table to get their name and major, then project:
    $\Pi_{\text{S\#, SNAME, MAJOR}}(\text{Students} \bowtie R_3)$

### Exercise3

For Database Schema:

*   **Students (S):** (S#, SNAME, SEX, MAJOR, SCHOLARSHIP)
*   **Courses (C):** (C#, CNAME, CREDIT)
*   **Learning (L):** (S#, C#, SCORE)

**(1) Retrieve information for students majoring in "International Trade" *and* receiving a scholarship, including Student ID (S#), Name (SNAME), Course Name (CNAME), and Score (SCORE).**

1.  Select students majoring in 'International Trade' and receiving a scholarship:
    $R_1 \leftarrow \sigma_{\text{MAJOR = 'International Trade' ∧ SCHOLARSHIP > 0}}(\text{Students})$
2.  Join with Learning to get their course scores:
    $R_2 \leftarrow R_1 \bowtie \text{Learning}$
3.  Join with Courses to get course names:
    $R_3 \leftarrow R_2 \bowtie \text{Courses}$
4.  Project the required attributes:
    $\Pi_{\text{S\#, SNAME, CNAME, SCORE}}(R_3)$

**(2) Retrieve Course ID (C#), Name (CNAME), and Credit (CREDIT) for courses where a student achieved a perfect score (100).**

1.  Select entries from Learning where SCORE is 100:
    $R_1 \leftarrow \sigma_{\text{SCORE = 100}}(\text{Learning})$
2.  Join with Courses to get course details:
    $R_2 \leftarrow R_1 \bowtie \text{Courses}$
3.  Project the required attributes (duplicates will be removed by projection):
    $\Pi_{\text{C\#, CNAME, CREDIT}}(R_2)$

**(3) Retrieve Student ID (S#), Name (SNAME), and Major (MAJOR) for students who did *not* receive a scholarship *and* have at least one course score above 95.**

1.  Find Student IDs (S#) of students who did *not* receive a scholarship:
    $R_1 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{SCHOLARSHIP = 0}}(\text{Students}))$
2.  Find Student IDs (S#) of students with at least one score > 95:
    $R_2 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{SCORE > 95}}(\text{Learning}))$
3.  Find students who satisfy both conditions (intersection):
    $R_3 \leftarrow R_1 \cap R_2$
4.  Join with Students to get their names and majors:
    $\Pi_{\text{S\#, SNAME, MAJOR}}(\text{Students} \bowtie R_3)$

**(4) Retrieve Student ID (S#), Name (SNAME), and Major (MAJOR) for all students who have *no course score below 80*.**

1.  Find Student IDs (S#) of students who *do* have at least one course score below 80:
    $R_1 \leftarrow \Pi_{\text{S\#}}(\sigma_{\text{SCORE < 80}}(\text{Learning}))$
2.  Find all distinct Student IDs (S#) from the Students table:
    $R_2 \leftarrow \Pi_{\text{S\#}}(\text{Students})$
3.  Subtract students who have scores below 80 from all students:
    $R_3 \leftarrow R_2 - R_1$
4.  Join with Students to get their names and majors:
    $\Pi_{\text{S\#, SNAME, MAJOR}}(\text{Students} \bowtie R_3)$

Here are the relational algebra expressions for the two problem sets, translated into English.

### Exercises4

Database Schema:

*   **S (Students):** (snum, sname, age, sex)
*   **SC (Student-Course):** (snum, cnum, score)
*   **C (Courses):** (cnum, cname, teacher)


**(1) Retrieve the Course Numbers (cnum) of courses *not* taken by student "Xiang Liu".**

1.  Find the `snum` of "Xiang Liu":
    $R_1 \leftarrow \Pi_{\text{snum}}(\sigma_{\text{sname = 'Xiang Liu'}}(\text{S}))$
2.  Find the `cnum` of courses taken by "Xiang Liu":
    $R_2 \leftarrow \Pi_{\text{cnum}}(\text{SC} \bowtie R_1)$
3.  Find all distinct `cnum` from the `Courses` table:
    $R_3 \leftarrow \Pi_{\text{cnum}}(\text{C})$
4.  Subtract courses taken by "Xiang Liu" from all available courses:
    $\text{Result} \leftarrow R_3 - R_2$

**(2) Retrieve the names (sname) of male students who have at least one course score above 90.**

1.  Find the `snum` of male students:
    $R_1 \leftarrow \Pi_{\text{snum}}(\sigma_{\text{sex = 'M'}}(\text{S}))$
2.  Find the `snum` of students who have at least one course score above 90:
    $R_2 \leftarrow \Pi_{\text{snum}}(\sigma_{\text{score > 90}}(\text{SC}))$
3.  Intersect these two sets of `snum` to find male students with scores > 90:
    $R_3 \leftarrow R_1 \cap R_2$
4.  Join with `Students` to get their names and project:
    $\text{Result} \leftarrow \Pi_{\text{sname}}(\text{S} \bowtie R_3)$

**(3) List the names (sname) of students who *did not select* the course "Artificial Intelligence".**

1.  Find the `cnum` for "Artificial Intelligence":
    $R_1 \leftarrow \Pi_{\text{cnum}}(\sigma_{\text{cname = 'Artificial Intelligence'}}(\text{C}))$
2.  Find the `snum` of students who *did* select "Artificial Intelligence":
    $R_2 \leftarrow \Pi_{\text{snum}}(\text{SC} \bowtie R_1)$
3.  Find all distinct `snum` from the `Students` table:
    $R_3 \leftarrow \Pi_{\text{snum}}(\text{S})$
4.  Subtract students who took "Artificial Intelligence" from all students:
    $R_4 \leftarrow R_3 - R_2$
5.  Join with `Students` to get their names and project:
    $\text{Result} \leftarrow \Pi_{\text{sname}}(\text{S} \bowtie R_4)$

**(4) Find the names (sname) of students who have taken *all* courses taught by "Teacher Yuan".**

1.  Find all `cnum` taught by "Teacher Yuan":
    $R_1 \leftarrow \Pi_{\text{cnum}}(\sigma_{\text{teacher = 'Teacher Yuan'}}(\text{C}))$
2.  Find all (`snum`, `cnum`) pairs from `SC`:
    $R_2 \leftarrow \Pi_{\text{snum, cnum}}(\text{SC})$
3.  Perform division to find `snum` of students who took all courses from `R_1`:
    $R_3 \leftarrow R_2 \div R_1$
4.  Join with `Students` to get their names and project:
    $\text{Result} \leftarrow \Pi_{\text{sname}}(\text{S} \bowtie R_3)$

**(5) Find the names (sname) of students for whom *every* course score is above 70 AND their *average* score for all courses is above 75.**

*   **Part 1: Students whose every course score is above 70 (using standard relational algebra):**
    1.  Find `snum` of students who have *any* score $\le$ 70:
        $R_{bad\_scores} \leftarrow \Pi_{\text{snum}}(\sigma_{\text{score} \le 70}(\text{SC}))$
    2.  Find all `snum` of students:
        $R_{all\_students} \leftarrow \Pi_{\text{snum}}(\text{S})$
    3.  Students with *all* scores > 70:
        $R_{\text{all\_gt\_70}} \leftarrow R_{all\_students} - R_{bad\_scores}$

*   **Part 2: Students whose average score is above 75 (requires extended relational algebra with aggregation):**
    *   Standard relational algebra does not include aggregation operators (like SUM, AVG, COUNT, GROUP BY) as primitive operations. However, most database courses introduce them as extensions. Assuming these extensions are allowed:
    1.  Group `SC` by `snum` and calculate the average score:
        $R_{\text{avg\_scores}} \leftarrow G_{\text{snum}; \text{AVG(score) AS AvgScore}}(\text{SC})$
    2.  Filter for students with `AvgScore` > 75:
        $R_{\text{avg\_gt\_75}} \leftarrow \Pi_{\text{snum}}(\sigma_{\text{AvgScore > 75}}(R_{\text{avg\_scores}}))$

*   **Combine and Final Result:**
    1.  Intersect the results from Part 1 and Part 2:
        $R_{\text{final\_snums}} \leftarrow R_{\text{all\_gt\_70}} \cap R_{\text{avg\_gt\_75}}$
    2.  Join with `Students` to get their names and project:
        $\text{Result} \leftarrow \Pi_{\text{sname}}(\text{S} \bowtie R_{\text{final\_snums}})$

### Exercises5

Database Schema:

*   **S (Suppliers):** (SNO, SNAME, STATUS, CITY)
*   **P (Parts):** (PNO, PNAME, WEIGHT, COLOR)
*   **J (Projects):** (JNO, JNAME, CITY)
*   **SPJ (Supply):** (SNO, PNO, JNO, QTY)

**(1) Provide the Supplier Numbers (SNO) of suppliers who supply Project J1.**

$\text{Result} \leftarrow \Pi_{\text{SNO}}(\sigma_{\text{JNO = 'J1'}}(\text{SPJ}))$

**(2) Provide all supply details (tuples from SPJ) where the quantity (QTY) is between 300 and 500 (inclusive).**

$\text{Result} \leftarrow \sigma_{\text{QTY >= 300 ∧ QTY <= 500}}(\text{SPJ})$

**(3) Provide the Part Numbers (PNO) of parts supplied by suppliers in 'London' to projects in 'London'.**

1.  Find `SNO` of suppliers in 'London':
    $R_1 \leftarrow \Pi_{\text{SNO}}(\sigma_{\text{CITY = 'London'}}(\text{S}))$
2.  Find `JNO` of projects in 'London':
    $R_2 \leftarrow \Pi_{\text{JNO}}(\sigma_{\text{CITY = 'London'}}(\text{J}))$
3.  Join `SPJ` with `R_1` and `R_2` and project `PNO`:
    $\text{Result} \leftarrow \Pi_{\text{PNO}}((\text{SPJ} \bowtie R_1) \bowtie R_2)$

**(4) Provide all Part Numbers (PNO) that satisfy the following condition: the supplier providing the part and the project using the part are in the same city.**

1.  Join `Suppliers`, `Supply`, and `Projects` tables:
    $R_1 \leftarrow \text{S} \bowtie \text{SPJ} \bowtie \text{J}$
2.  Select tuples where `S.CITY` equals `J.CITY`:
    $R_2 \leftarrow \sigma_{\text{S.CITY = J.CITY}}(R_1)$
3.  Project the `PNO`:
    $\text{Result} \leftarrow \Pi_{\text{PNO}}(R_2)$

**(5) Provide the Project Names (JNAME) of all projects supplied by supplier S1.**

1.  Select supply records for `S1`:
    $R_1 \leftarrow \sigma_{\text{SNO = 'S1'}}(\text{SPJ})$
2.  Join with `Projects` to get project details:
    $R_2 \leftarrow R_1 \bowtie \text{J}$
3.  Project `JNAME`:
    $\text{Result} \leftarrow \Pi_{\text{JNAME}}(R_2)$

**(6) Provide the Project Names (JNAME) of projects that use parts supplied by suppliers who supply 'red' parts.** (Assuming "red parts" means parts with `COLOR = 'Red'`, and "suppliers who supply red parts" means suppliers who supply *at least one* red part).

1.  Find `PNO` of red parts:
    $R_1 \leftarrow \Pi_{\text{PNO}}(\sigma_{\text{COLOR = 'Red'}}(\text{P}))$
2.  Find `SNO` of suppliers who supply these red parts:
    $R_2 \leftarrow \Pi_{\text{SNO}}(\text{SPJ} \bowtie R_1)$
3.  Find `JNO` of projects involved with these suppliers:
    $R_3 \leftarrow \Pi_{\text{JNO}}(R_2 \bowtie \text{SPJ})$
4.  Join with `Projects` to get `JNAME`:
    $\text{Result} \leftarrow \Pi_{\text{JNAME}}(\text{J} \bowtie R_3)$

**(7) Find the Project Names (JNAME) of projects that use *all* parts.**

1.  Find all distinct `PNO` from the `Parts` table:
    $R_1 \leftarrow \Pi_{\text{PNO}}(\text{P})$
2.  Find all (`JNO`, `PNO`) pairs from `SPJ`:
    $R_2 \leftarrow \Pi_{\text{JNO, PNO}}(\text{SPJ})$
3.  Perform division to find `JNO` of projects using all parts:
    $R_3 \leftarrow R_2 \div R_1$
4.  Join with `Projects` to get `JNAME`:
    $\text{Result} \leftarrow \Psi_{\text{JNAME}}(\text{J} \bowtie R_3)$

**(8) Find the Supplier Names (SNAME) of suppliers who supply *both* parts P1 and P2.**

1.  Find `SNO` that supply `P1`:
    $R_1 \leftarrow \Pi_{\text{SNO}}(\sigma_{\text{PNO = 'P1'}}(\text{SPJ}))$
2.  Find `SNO` that supply `P2`:
    $R_2 \leftarrow \Pi_{\text{SNO}}(\sigma_{\text{PNO = 'P2'}}(\text{SPJ}))$
3.  Intersect these sets of `SNO`:
    $R_3 \leftarrow R_1 \cap R_2$
4.  Join with `Suppliers` to get `SNAME` and project:
    $\text{Result} \leftarrow \Pi_{\text{SNAME}}(\text{S} \bowtie R_3)$

**(9) Display the Part Names (PNAME) of parts that have the same color as the part named "TV".** (Assuming "TV" is a `PNAME` value).

1.  Find the `COLOR` of the part named "TV":
    $R_1 \leftarrow \Pi_{\text{COLOR}}(\sigma_{\text{PNAME = 'TV'}}(\text{P}))$
2.  Find `PNAME` of parts with that `COLOR`:
    $R_2 \leftarrow \text{P} \bowtie R_1$
3.  Project `PNAME` (excluding the part 'TV' itself if required, but the query doesn't specify exclusion):
    $\text{Result} \leftarrow \Pi_{\text{PNAME}}(R_2)$

**(10) Find the Project Names (JNAME) of projects that use *all* parts supplied by S1.**

1.  Find all distinct `PNO` supplied by `S1`:
    $R_1 \leftarrow \Pi_{\text{PNO}}(\sigma_{\text{SNO = 'S1'}}(\text{SPJ}))$
2.  Find all (`JNO`, `PNO`) pairs from `SPJ`:
    $R_2 \leftarrow \Pi_{\text{JNO, PNO}}(\text{SPJ})$
3.  Perform division to find `JNO` of projects using all parts from `R_1`:
    $R_3 \leftarrow R_2 \div R_1$
4.  Join with `Projects` to get `JNAME`:
    $\text{Result} \leftarrow \Pi_{\text{JNAME}}(\text{J} \bowtie R_3)$

### Exercises6

Database Schema:

*   **Student:** Student(Sno, Sname, Ssex, Sage, Sdept)
*   **Course:** Course(Cno, Cname, Cpno) (Cpno is the Cno of the prerequisite course)
*   **SC (Student-Course):** SC(Sno, Cno, Grade)

**(1) Find the names (Sname) and ages (Sage) of all students in the 'CS' department.**

$\text{Result} \leftarrow \Pi_{\text{Sname, Sage}}(\sigma_{\text{Sdept = 'CS'}}(\text{Student}))$

**(2) Find the student IDs (Sno) of all students who have a grade less than 60.**

$\text{Result} \leftarrow \Pi_{\text{Sno}}(\sigma_{\text{Grade < 60}}(\text{SC}))$

**(3) Find the names (Sname) and departments (Sdept) of students who took course 'C002'.**

1.  Find `Sno` of students who took 'C002':
    $R_1 \leftarrow \Pi_{\text{Sno}}(\sigma_{\text{Cno = 'C002'}}(\text{SC}))$
2.  Join with `Student` to get their names and departments:
    $\text{Result} \leftarrow \Pi_{\text{Sname, Sdept}}(\text{Student} \bowtie R_1)$

**(4) Find the student IDs (Sno) of those who took both course 'C001' and 'C002'.**

1.  Find `Sno` of students who took 'C001':
    $R_1 \leftarrow \Pi_{\text{Sno}}(\sigma_{\text{Cno = 'C001'}}(\text{SC}))$
2.  Find `Sno` of students who took 'C002':
    $R_2 \leftarrow \Pi_{\text{Sno}}(\sigma_{\text{Cno = 'C002'}}(\text{SC}))$
3.  Intersect the two sets of `Sno`:
    $\text{Result} \leftarrow R_1 \cap R_2$

**(5) Find the names (Sname) of students who took 'C001' but not 'C002'.**

1.  Find `Sno` of students who took 'C001':
    $R_1 \leftarrow \Pi_{\text{Sno}}(\sigma_{\text{Cno = 'C001'}}(\text{SC}))$
2.  Find `Sno` of students who took 'C002':
    $R_2 \leftarrow \Pi_{\text{Sno}}(\sigma_{\text{Cno = 'C002'}}(\text{SC}))$
3.  Find `Sno` of students who took 'C001' but *not* 'C002':
    $R_3 \leftarrow R_1 - R_2$
4.  Join with `Student` to get their names:
    $\text{Result} \leftarrow \Pi_{\text{Sname}}(\text{Student} \bowtie R_3)$

**(6) Find students (Sno) who took *all* the courses taken by student 'S001'.**

1.  Find all `Cno` taken by student 'S001':
    $R_1 \leftarrow \Pi_{\text{Cno}}(\sigma_{\text{Sno = 'S001'}}(\text{SC}))$
2.  Use the `SC` table (projected to `Sno, Cno`) and `R_1` in a division operation:
    $\text{Result} \leftarrow \Pi_{\text{Sno, Cno}}(\text{SC}) \div R_1$

**(7) Find the name (Cname) of the prerequisite course for 'Data Structures'.**

1.  Find the `Cno` of 'Data Structures':
    $R_1 \leftarrow \sigma_{\text{Cname = 'Data Structures'}}(\text{Course})$
2.  Join `R_1` with `Course` (aliased to find the prerequisite):
    
    $R_2 \leftarrow \rho_{\text{CourseDS(\text{CnoDS}, \text{CnameDS}, \text{CpnoDS})}}(R_1)$

    $R_3 \leftarrow \sigma_{\text{Course.Cno = R2.CpnoDS}}(\text{Course} \times R_2)$
3.  Project the `Cname` of the prerequisite course:
    $\text{Result} \leftarrow \Pi_{\text{Cname}}(R_3)$

**(8) For each course, find the number of students enrolled and the average grade.**

$\text{Result} \leftarrow \mathcal{G}_{\text{Cno}; \text{COUNT(Sno) AS NumStudents, AVG(Grade) AS AverageGrade}}(\text{SC})$

**(9) Find the student IDs (Sno) and average grades (AverageGrade) of students whose average grade is greater than 85.**

1.  Calculate the average grade for each student:
    $R_1 \leftarrow \mathcal{G}_{\text{Sno}; \text{AVG(Grade) AS AverageGrade}}(\text{SC})$
2.  Select students whose `AverageGrade` is greater than 85:
    $\text{Result} \leftarrow \sigma_{\text{AverageGrade > 85}}(R_1)$

**(10) Find the names (Sname) of students enrolled in more than 3 courses.**

1.  Count the number of courses each student is enrolled in:
    $R_1 \leftarrow \mathcal{G}_{\text{Sno}; \text{COUNT(Cno) AS NumCourses}}(\text{SC})$
2.  Select students enrolled in more than 3 courses:
    $R_2 \leftarrow \Pi_{\text{Sno}}(\sigma_{\text{NumCourses > 3}}(R_1))$
3.  Join with `Student` to get their names:
    $\text{Result} \leftarrow \Pi_{\text{Sname}}(\text{Student} \bowtie R_2)$
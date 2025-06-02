---
author: wdlin
pubDatetime: 2025-06-01T11:54:00
modDatetime: 2025-06-01T15:29:00
title: PLP 阅读随笔
slug: PLP
featured: false
draft: false
tags:
  - PL
  - compiler
description:
  《程序设计语言》一书阅读中的一些记录.
---

## Table of contents

## Introduction

存在两种翻译的模式，一种是**编译**，一种是**解释**. 解释器有更大的灵活性，运用了延迟约束（late binding）的方法，而编译器一般能带来更好的性能，也就是编译优化. 区别在于彻底的分析和非平凡的变换.

但实际情况是许多语言采用两者的混合，由源程序经过一个翻译器（可能是解释的，也可能是混合的）得到中间语言 IR，然后 IR 和输入一起进入虚拟机得到输出. 这是一种比较笼统的界定，具体情况各不相同.

编译的阶段：
- 词法分析 Lexical and Syntax Analysis
	- 将单词组织为一棵**语法分析树** parse tree
	- 部分组合使用递归的规则定义则称**上下文无关语法** context-free grammar
- 语义分析 Semantic Analysis 与中间代码生成 Intermediate Code Generation
	- 追踪标识符的表达式的类型
	- 通常需要构造并维护一个符号表 symbol table
	- 并非所有语义规则都能在编译时检查，区分了静态语义和动态语义
	- 静态语义中语义分析器通常把语法分析树转换为（抽象）语法树 AST
	- 许多编译器里带标注的语法树就是从前端传递到后端的中间形式
- 目标代码生成 Target Code Generation
- 优化 Optimization

## Programming Language Syntax

记法：

```
digit -> 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
non_zero_digit -> 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
natural_number -> non_zero_digit digit*
```

语法与语义的关系就像能指与所指的关系.

### Specifying Syntax: Regular Expressions and Context-Free Grammars

就如同记法中所展示的，我们使用了拼接、选择和 Kleene 星号共三类规则，基于这三种规则定义出的字符串集合都成为**正则集**或**正则语言**，显然这是由正则表达式生成加之由扫描器识别的.

如果我们加上递归这一条规则，就称之为**上下文无关语言** CFL，由**上下文无关文法** CFG 定义，由语法分析器识别. 此处讨论的都是**形式语言**，一个形式语言意味着只是字符串的集合。没有附加其上的语义.

上下文无关文法里的一条规则成为一个**产生式**，左部的符号成为变量或非终结符，右侧的符号成为终结符. 这种记法有时被成为 Backus-Naur 形式 BNF. 也存在扩充的 BNF 即 EBNF.

在推导语法分析树时有可能产生歧义，这是因为替换策略不同所导致的语法分析树不唯一. 最右推导（也称规范推导）与最左推导显然是不一样的，所得到的**产出式**（仅由终结符构成）就不一样. 推导一颗语法分析树，以文法的开始符号为根，所有树叶构成其产出式，非根节点表示一次产生式应用.

例如表达式 `3 + 4 * 5` 在词法分析时先要根据产生式 `expr -> term | expr add_op term` 做 `expr -> expr add_op term`，由此得到的是 `term + term`，与先运算乘法的优先级是相反的. 做过 NJU PA 的友友应该都考虑过这一点.

### Scanning

> to be continue...


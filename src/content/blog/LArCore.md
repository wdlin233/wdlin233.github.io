---
author: wdlin
pubDatetime: 2025-04-18T15:50:00+08:00
modDatetime: 2025-04-18T15:54:00+08:00
title: rCoreloongArch 学习笔记
slug: rCoreloongArch
featured: false
draft: false
tags:
  - rCore
  - OS
description:
  rCoreloongArch 学习笔记.
---

## 第二章

### 特权级架构

龙芯架构定义了 4 个运行特权等级（Privilege LeVel, PLV），分别是 PLV0~PLV3. 应用软件应运行在 PLV1~PLV3 上，通常是在 PLV3 上，与运行在 PLV0 级上的操作系统等系统软件隔离开。与 RISC-V 不同，loongarch 架构下没有所谓的M态。

讲到特权级就必然涉及各种状态寄存器 CSR，这些内容在龙芯官方的手册中比较详尽，这里仅对比较重要的 CSR 提供一个索引以供复习方便。

CPU 当前的运行模式由 CRMD 的 PLV 域值所决定。

多个中断源涉及的指令系统中，高优先级中断可以抢占低优先级的中断。

### 特权级切换（应用程序）

LA 的内联汇编不稳定，撰写汇编文件以提供系统调用。

EENTRY CSR 是除了 TLB重填例外 和 机器错误 的入口地址. 其余两个分别来自 TLBRENTRY CSR 和 MERRENTRY CSR. EENTRY CSR 的低 12 位全部为 0 是因为保持页对齐，或者说入口地址是一个“入口页号 | 页内偏移”的结构。

可以在例外配置 ECFG 的 VS 段中设置 `VS != 0` 以设置不同的例外入口，或者说入口的值为

$$
2^(CSR.ECFG.VS + 2) times (ecode + 64)
$$

此时，各例外和中断间的入口地址间距是 $2^VS$ 条指令. 统一入口是一种节省地址空间的策略. 使用多入口时，硬件可直接跳转到对应处理程序，省去软件判断例外类型的步骤，减少中断响应延迟. 不过在 rCoreloongArch 中采用统一的入口地址.

以上是关于返回入口的问题。当一个异常发生时：

1. 将被异常打断的指令地址 EPTR 根据类型放在 TLBRBERA / MERRERA / ERA 中.
2. 设置 CRMD.PLV 以调整特权级，并将 CRMD.IE 域置为 0 以屏蔽所有中断.
3. 将 CRMD 的旧值记录在 PRMD.PPLV 和 PRMD.PIE 中.
4. 存放其他内容例如 ESTAT.Ecode 和 ESTAT.EsubCode 及 BADI 等.
5. 然后就是一般的异常处理，处理异常之后恢复执行状态.

```rust
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct TrapContext {
    pub x: [usize; 32], //通用寄存器 ，第4个寄存器是sp
    pub sstatus: usize, //控制状态寄存器
    pub sepc: usize,    //异常处理返回地址
}
```

其中 `sstatus` 即 PRMD 的值，`sepc` 即 ERA 的值. 

`__alltraps` 和 `__restore` 因为架构和 QEMU 中 `DSAVE` 寄存器的原因有所改变，具体可以看文档此处不细说. 初始化例外入口 `init()` 和 `trap_handler` 当然也需要修改，但更多是实现上的细节.

## 第三章

### 任务切换

任务切换是 Trap 控制流切换以外的另一种异常控制流，但它不涉及特权级切换.

```rust
/// 任务上下文
/// 对于一般的函数，编译器会在函数的起始位置自动生成代码保存 被调用者保存寄存器
/// _switch函数不会被编译器特殊处理，因此我们需要手动保存这些寄存器
/// 而其它寄存器不保存时因为属于调用者保存的寄存器是由编译器在高级语言编写
/// 的调用函数中自动生成的代码来完成保存的；还有一些寄存器属于临时寄存器，
/// 不需要保存和恢复。
#[derive(Copy, Clone,Debug)]
#[repr(C)]
pub struct TaskContext {
    //ra: 此寄存器存储的是函数返回时跳转的地址
    //在调用函数返回指令时,Pc指针会跳转到ra里面的地址
    ra: usize,
    sp: usize,
    s: [usize; 10], //loongArch下需要保存10个s寄存器
}
```

删除了 `trap.S` 中 `__restore` 的 `move $sp, $a0`，因为 `__switch` 已正确修改了 `$sp` 的值.

`init_app_cx` 初始化一个具体 app 的上下文，其中调用 `app_init_context` 初始化上下文的各字段. `goto_restore` 调用 `__restore` 并将获取的上下文放回. 
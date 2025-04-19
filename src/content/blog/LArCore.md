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

龙芯架构定义了 4 个运行特权等级（Privilege LeVel, PLV），分别是 PLV0\~PLV3. 应用软件应运行在 PLV1\~PLV3 上，通常是在 PLV3 上，与运行在 PLV0 级上的操作系统等系统软件隔离开。与 RISC-V 不同，loongarch 架构下没有所谓的M态。

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

### 时钟

loongarch 上的各种中断会被处理器采样至 ESTAT.IS 这一中断状态位上，与 ECFG.LIE 的局部中断使能位进行按位与运算后，得到 13 位的中断向量 int_vec. 若全局中断使能 CRMD.IE 为 1 则处理器认为有需要响应的中断.

时钟相关的寄存器有定时器配置 TCFG 和定时器数值 TVAL. 在 TCFG.En 中开启中断，时钟频率由 TCFG.Initval 决定.

开启时钟中断代码如下：

```rust
pub fn enable_timer_interrupt() {
    Ticlr::read().clear(); //清除时钟专断
    Tcfg::read()
        .set_enable(true) //开启计时
        .set_loop(true) //开启循环
        .set_tval(0x100000usize) //设置中断间隔时间
        .flush(); //写入计时器的配置
    Ecfg::read().set_local_interrupt(11, true); //开启局部使能中断
    Crmd::read().set_interrupt_enable(true); //开启全局中断
}
```

还针对 Stable Counter 做了一个获取计时器的实现 `Time::read`.

## 第四章

### 寄存器设计

对于 loongarch 平台的寄存器操作或 IO 操作的支持不如 RISC-V 和 x86，因此我们实现 `Register` trait 用于手动操作。

```rust
pub trait Register {
    fn read() -> Self;
    fn write(&mut self);
}
```

在 ch4 这个分支的 loongrCore/src/loong_arch/register 下对各个寄存器都进行了定义，最近的更改时间是 3 年以前. new_main 这个分支上仍存在 register，但在 master 分支上已经没有这个文件夹了，疑似 loongarch 提供了更好的寄存器支持，待查证。根据 commit `4fa17c4` feat: use new crate loongarch64:

```rust
 use loongarch64::cpu;
 use loongarch64::register::*;
```

又有 `cpucfg rd, rj` 可以读取配置信息字，具体通过指定配置字号、配置助记名称和位下标进行读取，具体可见于龙芯的架构参考手册。这个指令实现在 ch4 分支中的 loongrCore/src/loong_arch/cpu.rs 下，在引入新的 `loongarch64` crate 后被删除. 实现起来也比较简单，最底层还是对 `asm!` 的调用.

### 内存分配

此处的 loongarch 参考的内存分配器应该是基于 [buddy_system_allocator](https://github.com/rcore-os/buddy_system_allocator/tree/master). 作者自行实现的分配器在 kernel/src/mm/system_allocator 下，文档中没有对这一部分的内容进行介绍.

用 `Locked<T>` 这个结构体封装 `Mutex<T>`，对 `Locked<T>::new()` 实现 const 初始化以在编译时创建静态而且线程安全的全局变量以应对静态初始化的场景. 当然也具有更好的拓展性.

> 其余的部分待以后补充吧。

### 存储管理

龙芯手册第五章指出 loongarch 管理的内存物理地址空间范围是 0 \~ 2^(PALEN - 1). 显然，虚拟地址空间和地址映射模式是密切相关的. 在 LA32 下应用能访问的地址空间为 0 \~ (2^(32) - 1). 在 LA64 下可以访问的是 0 \~ (2^(VALEN) - 1).

手册 5.2 节，CRMD 的 DA 和 PG 段分别表示直接地址翻译和映射地址翻译，二者不可以同时为 1. 直接地址翻译将 物理地址直接等于 虚拟地址的 [PALEN - 1: 0] 位，而映射地址翻译 又分为**直接映射模式**和**页表映射模式**两种，若无法直接映射才采用页表映射模式.

直接映射模式地址翻译模式，提及了一种窗口机制，我理解的就是一种**映射**的机制. 这里有 DMW0 \~ DMW3 四个寄存器，用在不同的指令操作上，通过判断虚拟地址的最高 4 位和配置窗口寄存器的 VSEG 域是否相等来评断是否命中，若命中则直接映射 [PALEN - 1: 0] 位虚拟地址为物理地址.

页表映射地址翻译模式将在页表机制 (TLB) 这个部分中详细讲到.

手册 5.3 节，有三种存储访问类型，一致可缓存 CC，强序非缓存 SUC 和 弱序非缓存 WUC. 直接地址翻译的存储访问类型由 CRMD.DATF 和 CRMD.DATM 决定，映射地址翻译要根据具体情况判断，手册上讲的比较清楚.

### 页表机制 (TLB)

映射地址翻译模式下，除了落在 直接映射配置窗口 中的地址之外，其余所有合法地址都需要通过 页表映射 完成虚实地址转换.

TLB 作为处理器中 存放操作系统页表信息的 一个临时缓存，用于取指和 load/store 操作的虚实地址转换过程. 显然直接映射模式并不是所学的 TLB 中的一部分，而是 MMU 中两种并行的独立硬件机制.

TLB 可以被视为页表的 Cache. 这张图解释了 TLB 的映射过程. 

![TLB 的映射过程](https://godones.github.io/rCoreloongArch/sourcepicture/image-20220814161652069.png "TLB 的映射过程")

loongarch 的 TLB 分为

1. 所有表项的页大小相同的 TLB (Singular‑Page‑Size TLB, STLB)，页大小可以通过 STLBPS 控制
2. 表项支持不同页大小的 TLB (Multiple‑Page‑Size TLB, MTLB)

MTLB 采用 全相联查找表 的形式，STLB 采用 多路组相联 的形式. STLB 以虚拟地址的 [PS + INDEX : PS + 1] 为索引访问各路信息.

谈及表项的区别，MTLB 的表项仅比 STLB 多了页大小信息. 但注意 loongarch 在 TLB 表项中使用了**虚双页号** VPPN，将页号 N 和 N+1 合并为一个 TLB 条目，所以 VPPN (VALEN - 13) 比 PPN0 和 PPN1 (PALEN - 12) 少一位，因为偶数页和奇数页在最低位分别补 0 和 1 即可得到.

接下来讲述 TLB 虚实地址翻译的过程：

1. TLB 查找，在 STLB 和 MTLB 两个 TLB 中，比较 ASID 值和 VPPN 值. 当然 TLB 表项中 G 为 1 的情况需要另外考虑. 查找到则称 TLB 命中.
2. 然后根据虚拟页号的最低位 `va[stlb_ps]`，决定取奇/偶页表项.
3. 检查命中页表项的 V 位域是否为 1 以决定是合法或异常的访问. 合法访问再检查权限等级 PLV 是否合规.
4. 上述检查都通过后，评断访问类型. 通过 `NX/NR/D` 域检查操作的合法性.
5. 取出虚拟页号 PPN 和存储访问类型 MAT. 分别用于拼接合成物理地址 paddr 和控制内存访问操作的类型.

TLB 相关的 CSR 可以分为三类：TLB 交互、软硬件页表遍历和 TLB 重填例外. 具体可见手册 5.4.3.3 部分. loongarch rCore 文档讲解了重填异常的例子，还有常见的 TLB 访问和控制指令.

RISC-V 是根据 SATP 寄存器上的 Mode 域决定分页机制的. 而 loongarch 是根据不同的页大小从而得到不同的多级页表结构. 具体映射关系如图：

![loongarch映射](https://godones.github.io/rCoreloongArch/sourcepicture/image-20220814165043640.png "loongarch映射")

虚拟地址的最高位 (PALEN - 1) 的值将决定最底层目录 (全局目录，Glocal Directory, PGD) 来自于 PGDL 或 PGDH 寄存器，其 Base 域分别是用户进程和内核进程的 PGD 表基地址. 本实验只使用 PGDL. 页表项格式有基本页和大页的区分.

### 多级页表与地址空间实现

> to be continue.
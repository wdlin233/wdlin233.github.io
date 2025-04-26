---
author: wdlin
pubDatetime: 2025-04-18T15:50:00
modDatetime: 2025-04-26T20:31:00
title: rCoreloongArch 学习笔记
slug: rCoreloongArch
featured: false
draft: false
tags:
  - rCore
  - OS
description:
  记录了我在阅读 rCoreloongArch 文档过程中的总结.
---

## Table of contents

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

loongarch rCore 中采用三级页表，因此对应修改页表大小，页大小规定为 `16kB` 会构成三级页表机制.

根据基本页页表项格式，重新设置 `PTEFlags` 的各个字段. 同时对 `PTEFlags` 设置默认实现 `default()`，注意 P 和 W 位只存在于页表项中，而不在 TLB 中.

```rust
bitflags! {
    pub struct PTEFlags: usize {
        const V = 1 << 0;
        const D = 1 << 1;
        const PLVL = 1 << 2;
        const PLVH = 1 << 3;
        const MATL = 1 << 4;
        const MATH = 1 << 5;
        const G = 1 << 6;
        const P = 1 << 7;
        const W = 1 << 8;
        const NR = 1 << 61;
        const NX = 1 << 62;
        const RPLV = 1 << 63;
    }
}
```

然后对页表项 `PageTableEntry`，定义各种方法，主要的差异在于 loongarch 的页表项布局不同于 RISC-V，在 `new()` 方法中将 `ppn: PhysPageNum` 与 `flags: PTEFlags` 并运算.

```rust
impl PageTableEntry {
    pub fn new(ppn: PhysPageNum, flags: PTEFlags) -> Self {
        let mut bits = 0usize;
        bits.set_bits(14..PALEN, ppn.0); //采用16kb大小的页
        bits = bits | flags.bits;
        PageTableEntry { bits }
    }
    ...
}
```

<a id="pte"></a>

根据 loongarch rCore 文档，与 RISC-V 不同，loongarch 的三级页表项的第1、2级页表并非页表项而仅是物理地址，只有最后一级页表的的页表项才是完整的页表项. *我对此存疑*，如果不检查各自页表项的访问合法性可能会出现问题.

`get_pte_array` 说每一个页都有 2048 个页表项，这是由一个页的大小 `PAGE_SIZE = 0x4000` 即 `16kB` 且一个 `PageTableEntry` 为 `64 bits` 可以计算得 

$
(16 * 1024 * 8 bits) / (64 bits) = 2048
$  

所以才有

```rust
impl PhysPageNum {
    pub fn get_pte_array(&self) -> &'static mut [PageTableEntry] {
        let pa: PhysAddr = self.clone().into();
        unsafe { core::slice::from_raw_parts_mut(pa.0 as *mut PageTableEntry, 2048) }
        //每一个页有2048个页表项
    }
    pub fn get_bytes_array(&self) -> &'static mut [u8] {
        let pa: PhysAddr = self.clone().into();
        unsafe { core::slice::from_raw_parts_mut(pa.0 as *mut u8, 16 * 1024) }
    }
}
```

`get_pte_array` 用于获取一个页中的所有页表项，`get_bytes_array` 中的 `pa.0 as *mut u8` 说明获取 16 * 1024 个 Bytes(u8 bits). 

然后我们需要考虑寻找到一个 `PageTableEntry` 的过程. 下方的 `index()` 函数即是获取一个虚拟地址的三级页表索引.

```rust
impl VirtPageNum {
    pub fn indexes(&self) -> [usize; 3] {
        let mut vpn = self.0;
        let mut idx = [0usize; 3];
        for i in (0..3).rev() {
            idx[i] = vpn & 2047; //2^11-1 每一页包含2048个页表项
            vpn >>= 11;
        }
        idx
    }
}
```

`VirtPageNum` 是页内偏移之外的部分，也就是三段虚拟页号所在的部分. 每段虚拟页号都为 11 个比特. 很明显 2047 这里起到的是 MASK 一样的作用应当使用常量进行标注，用于取出每段虚拟页号.

根据[先前所说](#pte)，`find_pte_create()` 和 `find_pte()` 在找到 PTE 后使用 `pte.is_zero()` 来判断有效性而非 `!pte.is_valid()`，因为非最后一级的页目录项只保存下一级目录的基地址. 其实我认为这是一种不好的设计，让 `PageTableEntry` 的形式变得十分不一致. 在 `map()` 这个方法上将 `flags` 与 `PTEFlags::default()` 求并而非 `PTEFlags::V`.

***

开启页表机制后就需要为内核和应用程序构建地址空间以实现地址转换. 在 loongarch 上使用直接映射窗口机制可以降低构建难度.

loongarch 内核地址空间是用映射窗口完成映射，在 RISC-V rCore 中是建立恒等映射. 但两者的作用是一样的，都是让虚拟地址等于物理地址. 实现直接映射窗口的代码如下：

```assembly
.section .text.init
.global _start

_start:
0:
    #设置映射窗口
    addi.d $t0,$zero,0x11
    csrwr $t0,0x180  #设置LOONGARCH_CSR_DMWIN0

    la.global $t0,1f #加载标签 `1` 的地址到 $t0
    jirl $zero, $t0,0
1:
    la.global $t0, sbss
    la.global $t1, ebss
    bgeu $t0, $t1, 3f   #bge如果前者大于等于后者则跳转
2:
    st.d $zero, $t0,0
    addi.d $t0, $t0, 8
    bltu $t0, $t1, 2b
3:
    bl main
```

写入 `0x11` 到 DMW0 寄存器，清零未初始化的数据段实现 BSS 段初始化，然后跳转 main 使得内核代码可以被正确执行.

有了直接映射窗口，就可以删除逻辑段 `MapArea` 中的 `map_type` 字段，因为此时不再区分恒等映射和非恒等映射，逻辑段只有应用程序的非恒等映射.

`MapArea` 中存在一个 `map_perm: MapPermission` 字段. `MapPermission` 是 `PTEFlags` 的子集，必然要对应修改. 可以对 `MapPermission` 实现默认方法 `default()` 设置其访问特权级为 PLV3.

在 `from_elf` 中 loongarch rCore 不使用跳板页. 回顾 RISC-V rCore 是因为地址空间的切换需要进行 trap 上下文的保存和恢复，而仅有的 sscratch 寄存器不足以在 trap 上下文保存到内核栈的情况下完成周转. 而 loongarch 有 CRMD 的 PLV 字段变化以实现应用程序和内核地址空间的自动切换，并且有更多临时寄存器以供周转而无需 trap 页. 于是 loongarch rCore 可以通过 

```rust
memory_set.push(
    MapArea::new(
        user_stack_bottom.into(),
        user_stack_top.into(),
        MapPermission::default() | MapPermission::W,
    ),
    None,
);
``` 

在内核栈上保存 trap 上下文. 但安全隐患就是内核栈如果溢出就会破坏内核. 然后我们就可以在 `trap::init()` 中配置相关寄存器以开启页表功能了.

还有 TLB 重填需要实现. 在各个寄存器的处理上还是有点小繁琐. 好在有 `tlbfill`, `lddir` 和 `ldpte` 提供了足够的抽象. 具体的操作可以看文档，TLB 重填异常处理程序如下：

```assembly
    .section tlb_handler
    .globl __tlb_rfill
    .align 4
__tlb_rfill:
    csrwr $t0, 0x8B   # 保存t0的值到CSR_TLBRSAVE，以便后续恢复 $t0
    csrrd $t0, 0x1B   # 读取PGD,类似于rcore中的token
    lddir $t0, $t0, 3   # 访问页目录表PGD
    lddir $t0, $t0, 1   # 访问页目录表PMD
    ldpte $t0, 0   # 加载页表项，取回偶数号页表项
    ldpte $t0, 1   # 加载页表项，取回奇数号页表项
    tlbfill   # 填充TLB
    csrrd $t0, 0x8B   # 恢复 $t0
    #jr $ra
    ertn
```

为完成 TLB 重填，还需要实现对 页修改 这一例外 `Exception(PageModifyFault)` 的处理. 在 RISC-V 上页表访问由硬件完成，因此某些位由硬件来设置. 但 loongarch 上全部又软件完成，包括 D(irty) 位.

```rust
/// Exception(PageModifyFault)的处理
/// 页修改例外：store 操作的虚地址在 TLB 中找到了匹配，且 V=1，且特权等级合规的项，但是该页
//  表项的 D 位为 0，将触发该例外
fn tlb_page_modify_handler() {
    // INFO!("PageModifyFault handler");
    //找到对应的页表项，修改D位为1
    let badv = TlbRBadv::read().get_val(); //出错虚拟地址
    let vpn: VirtAddr = badv.into(); //虚拟地址
    let vpn: VirtPageNum = vpn.floor(); //虚拟地址的虚拟页号
    let token = current_user_token(); //根页表的地址
    let page_table = PageTable::from_token(token);
    let pte = page_table.find_pte(vpn).unwrap(); //获取页表项
    pte.set_dirty(); //修改D位为1
    unsafe {
        asm!("tlbsrch", "tlbrd",); //根据TLBEHI的虚双页号查询TLB对应项
    }
    let tlbidx = TlbIdx::read(); //获取TLB项索引
    assert_eq!(tlbidx.get_ne(), false);
    let mut tlbelo0 = TLBELO::read(0); //获取TLB项0
    let mut tlbelo1 = TLBELO::read(1); //获取TLB项1
    tlbelo0.set_dirty(true).write();
    tlbelo1.set_dirty(true).write();
    unsafe {
        asm!("tlbwr"); //重新将tlbelo写入tlb
    }
}
```

前半部分就是取出当前出错的虚拟地址，将其对应的 `PageTableEntry` 的 Dirty 位进行修改. 后半涉及 TLB 的部分是在修改页表后同步 TLB 的过程. 使用 `tlbsrch` 指令搜索匹配的 TLB 项，若找到则会将 `TLBIDX` 寄存器的 `NE` (No Entry) 位设置为 `false`. `tlbrd` 和 `tlbwr` 各自对应读取和写回.

## 第五章

loongarch rCore 采用了不同的内核栈分配方式，`KernelStack` 包裹一个物理页帧 `FrameTracker`.

```rust
/// Kernelstack for app
#[derive(Clone, Debug)]
pub struct KernelStack {
    frame:FrameTracker,
}
```

在 RISC-V rCore 中则是以 `pub struct KernelStack(pub usize);` 为内核栈. 但或许可以认为在具体实现方法上二者的差别也不是很大，不如说 `FrameTracker` 只是对 `ppn(usize)` 的包裹，loongarch 上少了 `KSTACK_ALLOCATOR` 而用 `FrameTracker` 而已.

不过在获取 Trap 上下文时，loongarch 是在内核栈中取得 `self.kernel_stack.get_trap_cx()`. 而 RISC-V 是在地址空间中通过 `PhysPageNum` 取得 `self.trap_cx_ppn.get_mut()`.

因为内核栈配置的更改，在 `TaskControlBlock::new()`, `TaskControlBlock::fork()` 和 `TaskControlBlock::exec()` 中就针对此进行了改动，当然还有部分是针对 loongarch 本身架构的配置，因为 `exec()` 切换了地址空间，所以先前 TLB 中的内容就需要无效化，这就是 `invtlb` 指令的作用. 类似地在 `exit_current_and_run_next()` 中也有这样的设置，因为进程退出时会对资源进行回收，TLB 中的快照会造成访问错误，需要删除.

## 第六章

文件系统是纯用户态的实现，因此我们可以直接在 loongarch rCore 中使用. 但 QEMU 模拟的 loongarch 没有相关的 virtio-block 设备. 于是替换 `-device virtio-blk-device,drive=x0,bus=virtio-mmio-bus.0` 为 `-device ahci,id=ahci0 \ -device ide-hd,drive=x0,bus=ahci0.0`.

我们考虑开发 PCI 总线的驱动. loongarch 将设备和存储空间统一编址，IO 空间和 Memory 空间都使用 load/store 操作，仅在于所在地址段的不同. PCI 总线定义每个设备的配置空间总长度为 256 个字节，前 64 个字节称为配置头用于识别设备和访问方式等信息. 配置空间中存在 6 组独立的基址寄存器 (Base Address Registers, BAR) 以传递给软件这些设备所需的地址空间大小并接受软件对其配置的基地址.

loongarch rCore 的 PCI 设备检测将 `pci` 库的某些实现方式由 I/O 端口访问改为 MMIO. 用 `Location::encode()` 方法构造内存地址. 在 `scan_bus` 扫描后，`dev.bars.iter().enumerate().for_each(|(index, bar)| {...})` 对 BAR 进行解析.

设备需要通过**中断**与 CPU 通讯，此处使用 MSI 中断. 在 PCI 设备扫描中，如果检测到了 SATA 设备，使用 `enable(dev.loc)` 配置 MSI 中断. `enable()` 可以分步拆解如下步骤：

```rust
let orig = am.read16(ops, loc, PCI_COMMAND);
// bit0     |bit1       |bit2          |bit3           |bit10
// IO Space |MEM Space  |Bus Mastering |Special Cycles |PCI Interrupt Disable
am.write32(ops, loc, PCI_COMMAND, (orig | 0x40f) as u32);
```

对 `PCI_COMMAND` 控制设备的基本行为，写入值 `0x40f` 以达成禁用传统 PCI 中断等一系列操作.

```rust
let mut cap_ptr = am.read8(ops, loc, PCI_CAP_PTR) as u16;
while cap_ptr > 0 {
    let cap_id = am.read8(ops, loc, cap_ptr);
    if cap_id == PCI_CAP_ID_MSI {
        // 找到 MSI 能力项
        // ...
    }
    cap_ptr = am.read8(ops, loc, cap_ptr + 1) as u16; // 跳转到下一能力项
}
```

遍历能力链表以找到 MSI 能力项.

```rust
MSI_IRQ += 1;
let irq = MSI_IRQ;
//检查是64位/32位模式
// we offset all our irq numbers by 32
if (orig_ctrl >> 16) & (1 << 7) != 0 {
    // 64bit
    am.write32(ops, loc, cap_ptr + PCI_MSI_DATA_64, irq + 32);
} else {
    // 32bit
    am.write32(ops, loc, cap_ptr + PCI_MSI_DATA_32, irq + 32);
}
```

`irq` 部分应该是中断号分配，全局中断号 `MSI_IRQ` 递增以保证唯一性. `write32()` 部分是在触发 MSI 中断时向桥片写入地址?. `irq + 32` 应该是避免与 Legacy 中断号发生冲突.

```rust
// enable MSI interrupt, assuming 64bit for now
am.write32(ops, loc, cap_ptr + PCI_MSI_CTRL_CAP, orig_ctrl | 0x10000);
msi_found = true;
```

启用 MSI 中断，若找不到 MSI 能力项会在之后退回传统中断.

中间还有一段 `am.write32(..., 0x2ff0_0000)` 用于设置 MSI 的目标地址，负责将 MSI 消息转换为 HT 中断报文，这就依赖于桥片的地址转换功能.

然后针对 SATA 协议和 AHCI 协议讲了很多东西，实际上我认为并不是针对初学者写作的，此处也略而不谈.

## 第八章

可以说 loongarch rCore 与 RISC-V 除了寄存器上的差别，大体上只有多级页表、TLB、内核栈与跳板页的差异.

对于进程控制块 `ProcessControlBlock` 和 `ProcessControlBlockInner` 没什么变化，但对于线程控制块 `TaskControlBlock`，由于我们将 Trap 上下文放在内核栈上，至此内核栈 `kstack` 成为会变化的元数据从而放在 `TaskControlBlockInner` 中，我们不需要从地址空间中获取 `trap_cx_ppn` 因此对其删除.

`res: Option<TaskUserRes>` 是为线程资源，为线程控制块 `TaskControlBlockInner` 中的一部分. `TaskUserRes::alloc_user_res` 是为线程申请资源的实现方法. 由于线程之间共享进程的地址空间，所以理所当然第一步先获取 `process_inner`.

```rust
pub fn alloc_user_res(&self) {
    let process = self.process.upgrade().unwrap();
    let mut process_inner = process.inner_exclusive_access();
    // alloc user stack
    let ustack_bottom = ustack_bottom_from_tid(self.ustack_base, self.tid);
    let ustack_top = ustack_bottom + USER_STACK_SIZE;
    process_inner.memory_set.insert_area(
        ustack_bottom.into(),
        ustack_top.into(),
        MapPermission::default() | MapPermission::W
    );
    // alloc trap_cx
}
```

`alloc_user_res()` 应当分为两步，分配用户栈和分配 Trap 上下文. 在 loongarch 中因为 Trap 上下文保存在内核栈上，所以 Trap 上下文初始化的部分在 `TaskUserRes` 之外，`alloc_user_res()` 中就删去了这部分内容.

在 `run_tasks()` 这一**进程切换**的方法中，相比 RISC-V 多出了

```rust
let pid = task.process.upgrade().unwrap().getpid();     // 获取进程 ID
let pgd = task.get_user_token() << PAGE_SIZE_BITS;      // 计算页表基地址
Pgdl::read().set_val(pgd).write();                      // 设置根页表寄存器
Asid::read().set_asid(pid as u32).write();              // 设置ASID
```

这是因为进程切换，进程切换后需要去切换虚拟地址空间，并重设 ASID 以用于 TLB 条目区分不同进程. 在这之后

```rust
// 在进行线程切换的时候
// 地址空间是相同的，并且pgd也是相同的
// 每个线程都有自己的内核栈和用户栈，用户栈互相隔离
unsafe {
    asm!("invtlb 0x4,{},$r0",in(reg) pid);              // 无效化 TLB 条目
}
```

清除旧进程的 TLB 条目以防止新进程使用错误的地址转换.

做这些是因为在 loongarch 中对 TLB 的处理属于软件部分，因此需要我们手动操作.
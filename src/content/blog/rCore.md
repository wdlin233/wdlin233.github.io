---
author: wdlin
pubDatetime: 2025-03-23T21:13:00
modDatetime: 2025-04-28T16:30:00
title: rCore (RISC-V) 学习笔记
slug: rCore-note
featured: false
draft: false
tags:
  - Rust
  - rCore
  - OS
description:
  在学习 rCore 操作系统内核时的各种总结和反思. 
---

这是我在参与开源操作系统训练营过程中，记录和总结反思 rCore 的学习笔记，实验指导手册在[这里](https://learningos.cn/rCore-Camp-Guide-2025S/)，但又一定程度上参考了往年的[文档](https://rcore-os.cn/rCore-Tutorial-Book-v3/index.html).

## Table of contents

## ch1 基本环境

### 内核启动

我们通过QEMU模拟CPU加电的执行过程：

```makefile
# os/Makefile
run-inner: build
	@qemu-system-riscv64 \
		-machine virt \
		-nographic \
		-bios $(BOOTLOADER) \
		-device loader,file=$(KERNEL_BIN),addr=$(KERNEL_ENTRY_PA)
```

其中 `-bios $(BOOTLOADER)` 在硬件内存中的固定位置 `0x80000000` 处放置了一个 BootLoader 程序 RustSBI. `-device loader,file=$(KERNEL_BIN),addr=$(KERNEL_ENTRY_PA)` 这个参数表示硬件内存中的特定位置 `$(KERNEL_ENTRY_PA)` 放置了操作系统的二进制代码 `$(KERNEL_BIN)`，具体在此处 `$(KERNEL_ENTRY_PA)` 的值是 `0x80200000` .

当我们执行包含上次参数的 qemu-system-riscv64 软件，就意味给这台虚拟的 RISC-V64 计算机加电了. 此时，CPU的其它通用寄存器清零，而PC寄存器会指向 `0x1000` 的位置，即 CPU 加电后执行的第一条指令的位置（固化在硬件中的一小段引导代码），它会很快跳转到 `0x80000000` 处， 即 RustSBI 的第一条指令. 这个过程可以通过 gdb 的逐句执行清晰看出.

RustSBI 完成基本的硬件初始化后， 会跳转操作系统的二进制代码 `$(KERNEL_BIN)` 所在内存位置 `0x80200000` ，执行操作系统的第一条指令。 这时我们的编写的操作系统才开始正式工作。

其中， `0x80000000` 是QEMU的硬件模拟代码中设定好的 `Bootloader` 的起始地址，`0x80200000` 是 RustSBI 的代码中设定好的操作系统**起始地址**.

> SBI 是 RISC-V 的一种底层规范，操作系统内核可直接调用SBI提供的底层功能，如关机、显示字符串等.

应用程序访问操作系统提供的系统调用的指令是 `ecall` ，操作系统访问 RustSBI 的SBI调用的指令也是 `ecall`. 但他们的特权级是不一样的，RustSBI 位于 M 态，通过 `ecall` 指令，可以完成从弱特权级到强特权级的转换.

```rust
// os/src/sbi.rs
fn sbi_call(which: usize, arg0: usize, arg1: usize, arg2: usize) -> usize {
    let mut ret;
    unsafe {
        llvm_asm!("ecall"
            : "={x10}" (ret)
            : "{x10}" (arg0), "{x11}" (arg1), "{x12}" (arg2), "{x17}" (which)
...

// os/src/main.rs
const SBI_SHUTDOWN: usize = 8;

pub fn shutdown() -> ! {
    sbi_call(SBI_SHUTDOWN, 0, 0, 0);
    panic!("It should shutdown!");
}

#[no_mangle]
extern "C" fn _start() {
    shutdown();
}
```

但这样直接加载运行是不行的，需要在 Cargo 中配置链接脚本以调整内存布局和栈空间，让入口地址为 RustSBI 约定的 `0x80200000`.

在 `os/src/linker.ld` 中指定了 `ENTRY(_start)`, `BASE_ADDRESS` 和各个逻辑段，在 `os/src/entry.asm` 中初始化栈空间. 在 `os/src/main.rs` 中又根据链接脚本中给出的全局符号清空了 `.bss` 段.

### 理解内存

CPU 可以通过物理地址来**逐字节**访问物理内存中保存的数据，通常以 `0x80000000` 为起始内存地址.

#### 函数调用: jalr 与 ret

在调用函数时，不同于分支、循环等其他控制流结构，被调用函数返回时，需要跳转到一个**运行时确定**（确切地说是在函数调用发生的时候）的地址，而不是一个编译器固定下来的地址。

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/function-call.png" alt="Function Call" style="zoom:67%;" />

对此，指令集必须给用于函数调用的跳转指令一些额外的能力，而不只是单纯的跳转。在 RISC-V 架构上，有两条指令即符合这样的特征.

| 名称             | 指令             | 指令功能                         |
| ---------------- | ---------------- | -------------------------------- |
| 跳转并链接       | jal rd, imm      | rd <- pc + 4<br />pc <- pc + imm |
| 寄存器跳转并链接 | jalr rd, imm(rs) | rd <- pc + 4<br />pc <- rs + imm |

这两条指令除了设置 pc 寄存器完成跳转功能之外，还将当前跳转指令的下一条指令地址保存在 `rd` 寄存器中。在 RISC-V 架构中， 通常使用 **`ra` 寄存器**（即 `x1` 寄存器）作为其中的 `rd` ，因此在函数返回的时候，只需跳转回 `ra` 所保存的地址即可。

函数返回时，我们常使用一条伪指令 (Pseudo Instruction) 跳转回调用之前的位置: `ret` . 它会被汇编器翻译为 

```assembly
jalr x0, 0(x1)
```

含义为**跳转到寄存器 `ra` 保存的物理地址**，由于 **`x0` 是一个恒为 0 的寄存器**，任何写入到 `x0` 的值都会被直接丢弃，在 `rd` 中，保存这一步被省略，即不需要保存返回地址.

进行函数调用的时候，我们通过 `jalr` 指令 保存返回地址并实现跳转；而在函数即将返回的时候，则通过 `ret` 指令跳转之前的下一条指令继续执行。这**两条指令**实现了函数调用流程的核心机制。

#### 函数调用上下文与调用规范

编译器除了函数调用的相关指令之外，基本不使用 `ra` 寄存器。意即，如果在函数中没有调用其他函数，那 `ra` 的值不会变化，函数调用流程能正常工作。但是，实际编写代码时，我们常常会遇到函数**多层嵌套调用**的情形。

因此我们需要保证，在一个函数调用子函数的前后，包括 `ra` 寄存器在内的所有通用寄存器的值都不能发生变化。 我们将由于函数调用，在控制流转移前后需要保持不变的**寄存器集合**称之为**函数调用上下文** context.

在调用子函数之前，我们需要在内存中的一个区域保存 (Save) 函数调用上下文中的寄存器；而之后我们会从内存中同样的区域读取并恢复 (Restore) 函数调用上下文中的寄存器。

函数调用上下文中的寄存器被分为如下[两类](https://blog.csdn.net/Edidaughter/article/details/122334074)：

- **被调用者保存** (Callee-Saved) 寄存器，即被调用的函数保证调用它前后，这些寄存器保持不变；
- **调用者保存** (Caller-Saved) 寄存器，被调用的函数可能会覆盖这些寄存器。

寄存器可见于[RISC-V 架构的 C 语言调用规范](https://riscv.org/wp-content/uploads/2015/01/riscv-calling.pdf)或[Cornell](http://www.cs.cornell.edu/courses/cs3410/2019sp/schedule/slides/10-calling-notes-bw.pdf).

函数调用上下文由调用者和被调用者分别保存，其具体过程分别如下：

- 调用者：首先保存不希望在函数调用过程中发生变化的调用者保存寄存器，然后通过 jal/jalr 指令调用子函数，返回回来之后恢复这些寄存器。
- 被调用者：在函数开头保存函数执行过程中被用到的被调用者保存寄存器，然后执行函数，在退出之前恢复这些寄存器。

无论是调用者还是被调用者，都会因调用行为而需要两段匹配的保存和恢复寄存器的汇编代码，可以分别将其称为开场白 (Prologue) 和收场白 (Epilogue)，它们会由编译器帮我们自动插入。

#### 栈指针与栈帧

函数调用上下文的保存/恢复的寄存器保存在栈(Stack)中 . `sp`(即`x2`寄存器) 用来保存**栈指针** (Stack Pointer)，它是一个指向了内存中**已经用过的位置**的一个地址。

在 RISC-V 架构中，栈是从高地址到低地址增长的。在一个函数中，作为起始的**开场白**负责分配一块新的栈空间，其实它只需要知道需要空间的大小，然后将 `sp` 的值减小相应的字节数即可，于是物理地址区间 [新sp,旧sp) 对应的物理内存便可以被用于，函数调用上下文的保存/恢复等，这块物理内存被称为这个函数的**栈帧** (Stackframe).

同理，函数中作为结尾的**收场白**负责将开场白分配的栈帧回收，这也仅仅需要 将 `sp` 的值增加相同的字节数回到分配之前的状态。这也可以解释为什么 `sp` 是一个**被调用者保存寄存器**。

函数调用过程中，栈帧分配与`sp`寄存器变化如图：

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/CallStack.png" alt= "栈指针" style="zoom:33%;" />

一个函数的栈帧内容可能如下.

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/StackFrame.png" alt="StackFrame" style="zoom:67%;" />

它的开头和结尾分别在 `sp(x2)` 和 `fp(s0)` 所指向的地址。按照地址从高到低分别有以下内容，它们都是通过 `sp` 加上一个偏移量来访问的：

- `ra` 寄存器保存其返回之后的跳转地址，是一个调用者保存寄存器；
- 父亲栈帧的结束地址 `fp`，是一个被调用者保存寄存器；
- 其他被调用者保存寄存器 `s1`~`s11`；
- 函数所使用到的局部变量。

因此，栈上实际上保存了一条完整的函数调用链，通过适当的方式我们可以实现对它的跟踪。

#### 程序内存布局

当我们将源代码编译为可执行文件之后，会得到一个看似充满杂乱无章字节的文件。这些字节至少可以分成代码和数据两部分，代码部分由一条条可以被 CPU 解码并执行的指令组成，而数据部分只被 CPU 视作可用的存储空间。

我们还可根据其功能，进一步把两个部分划分为更小的单位： **段** (Section) . 不同的段会被编译器放置在内存不同的位置上，这构成了程序的 **内存布局** (Memory Layout)。一种典型的程序相对内存布局如下：

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/MemoryLayout.png" alt="内存布局" style="zoom:33%;" />

代码部分只有代码段 `.text` 一个段，存放程序的所有汇编代码。

数据部分则还可以继续细化：

- 已初始化数据段保存程序中那些已初始化的全局数据，分为 `.rodata` 和 `.data` 两部分。前者存放只读的全局数据，通常是常数或常量字符串等；而后者存放可修改的全局数据。
- 未初始化数据段 `.bss` 保存程序中那些未初始化的全局数据，通常由程序的加载者代为进行零初始化，也即将这块区域逐字节清零；
- **堆** (heap) 区域用来存放程序运行时动态分配的数据，如 C/C++ 中的 `malloc`/`new` 分配到的数据本体就放在堆区域，它向高地址增长；
- 栈区域 stack 不仅用作函数调用上下文的保存与恢复，每个函数作用域内的局部变量也被编译器放在它的栈帧内。它向低地址增长。

对于堆上的动态变量，其本体被保存在堆上，大小在**运行时**才能确定。而我们只能直接访问栈上或者全局数据段中的**编译期确定大小**的变量。 因此，我们需要通过一个（运行时分配内存得到的）指向堆上数据的指针来访问它。指针的位宽确实在编译期就能够确定。该指针即可以作为局部变量放在栈帧内，也可以作为全局变量放在全局数据段中。

## ch2 批处理系统

### 应用程序构建

对`ci-user/user/src/bin`中的任何一个文件，可以看到`main`函数和外部库引用：

```rust
#[macro_use]
extern crate user_lib;
```

这个外部库其实就是 `user/src` 目录下的 `lib.rs` 以及它引用的若干子模块。 在 `user/Cargo.toml` 中我们对于库的名字进行了设置： `name = "user_lib"` 。 它作为应用程序所依赖的用户库，等价于其他编程语言提供的标准库。

```toml
[package]
name = "user_lib"
version = "0.1.0"
authors = ["Yifan Wu <shinbokuow@163.com>"]
edition = "2018"
```

在`lib.rs`中，定义用户库的入口点`_start`.

```rust
#[no_mangle]
#[link_section = ".text.entry"]
pub extern "C" fn _start() -> ! {
    clear_bss();
    exit(main());
}
```

第 2 行使用 Rust 的宏将 `_start` 这段代码编译后的汇编代码中放在一个名为 `.text.entry` 的代码段中，方便我们在后续链接的时候 调整它的位置使得它能够作为用户库的入口。

用`clear_bss()`函数手动清空`.bss`段. `clear_bss()`定义在`lib.rs`中。关于内存布局中的各数据段，参考[静态存储区（Bss、数据段、代码段），堆，栈-CSDN博客](https://blog.csdn.net/sgc_bf/article/details/101227860).

```rust
// ci-user/user/src/lib.rs
#![feature(linkage)]    // 启用弱链接特性

#[linkage = "weak"]
#[no_mangle]
fn main() -> i32 {
    panic!("Cannot find main!");
}
```

在 `lib.rs` 中定义一个 `main` 函数，其具有弱链接特性。在编译过程中，弱符号遇到强符号时，会选择强符号而丢掉弱符号。参考[嵌入式C语言自我修养 09：链接过程中的强符号和弱符号 - 知乎](https://zhuanlan.zhihu.com/p/55768978). 由此实现 `bin` 目录下的 `main` 替换了 `lib.rs` 下的 `main`.

### 系统调用

<a id="syscall"></a>
在系统调用时，我们需要将对应的参数储存在寄存器中，我们需要了解RISC-V架构中寄存器的相关知识[RISV-V架构的寄存器介绍_riscv寄存器-CSDN博客](https://blog.csdn.net/weixin_42031299/article/details/132839814).

在 `syscall` 中，应用程序来通过 `ecall` 调用批处理系统提供的接口，由于应用程序运行在 U 模式， `ecall` 指令会触发名为 `Environment call from U-mode` 的<u>异常</u>，并 Trap 进入 S 模式.

约定如下系统调用.

```rust
/// 功能：将内存中缓冲区中的数据写入文件。
/// 参数：`fd` 表示待写入文件的文件描述符；
///      `buf` 表示内存中缓冲区的起始地址；
///      `len` 表示内存中缓冲区的长度。
/// 返回值：返回成功写入的长度。
/// syscall ID：64
fn sys_write(fd: usize, buf: *const u8, len: usize) -> isize;

/// 功能：退出应用程序并将返回值告知批处理系统。
/// 参数：`xstate` 表示应用程序的返回值。
/// 返回值：该系统调用不应该返回。
/// syscall ID：93
fn sys_exit(xstate: usize) -> !;
```

系统调用实际上是汇编指令级的二进制接口，这里只给出使用 Rust 语言描述的版本。在实际调用的时候，需要按照 RISC-V 调用规范在合适的寄存器中放置系统调用的参数，然后执行 `ecall` 指令触发 Trap. 在 Trap 回到 U 模式的应用程序代码之后，会从 `ecall` 的 下一条指令继续执行，同时我们能够按照调用规范在合适的寄存器中读取返回值。

<a id="a7"></a>

约定寄存器 `a0~a6` 保存系统调用的参数， `a0~a1` 保存系统调用的**返回值**。寄存器 `a7` 用来传递 **syscall ID**，这是因为所有的 syscall 都是通过 `ecall` 指令触发的，除了各输入参数之外我们还额外需要一个寄存器，保存要请求哪个系统调用。

由于这超出了 Rust 语言的表达能力，我们需要在代码中使用内嵌汇编来完成参数/返回值绑定和 `ecall` 指令的插入.

```rust
// user/src/syscall.rs
fn syscall(id: usize, args: [usize; 3]) -> isize {
   let mut ret: isize;
   unsafe {
       core::arch::asm!( // v3: llvm_asm!(...)
           "ecall",
           inlateout("x10") args[0] => ret, // x10 - a0
           in("x11") args[1],
           in("x12") args[2],
           in("x17") id // x17 - a7
       );
   }
   ret
}
```

这里使用了Rust的内联汇编宏`asm!`，参考[Inline assembly - The Rust Reference](https://doc.rust-lang.org/nightly/reference/inline-assembly.html). 由于Rust 编译器无法判定汇编代码的安全性，所以我们需要将其包裹在 unsafe 块中.

简而言之，这条汇编代码的执行结果是以寄存器 `a0~a2` 来保存系统调用的参数，以及寄存器 `a7` 保存 syscall ID， 返回值通过寄存器 `a0` 传递给局部变量 `ret`.

在 `inlateout("x10") args[0] => ret`：

- 传值：`args[0]` 是输入值，它会在调用 `ecall` 之前被加载到 `x10` 寄存器。
- 返回结果：执行完 `ecall` 后，`x10` 的值变为结果值，并把这个结果存入变量 `ret`.

***

于是我们基于`syscall`就可以实现一些基本的系统功能：

```rust
// user/src/syscall.rs
const SYSCALL_WRITE: usize = 64;
const SYSCALL_EXIT: usize = 93;

pub fn sys_write(fd: usize, buffer: &[u8]) -> isize {
    syscall(SYSCALL_WRITE, [fd, buffer.as_ptr() as usize, buffer.len()])
}

pub fn sys_exit(xstate: i32) -> isize {
    syscall(SYSCALL_EXIT, [xstate as usize, 0, 0])
}
```

`sys_write` 使用一个 `&[u8]` 切片类型来描述缓冲区，这是一个**胖指针** (Fat Pointer)，里面既包含缓冲区的起始地址，还包含缓冲区的长度。我们可以分别通过 `as_ptr` 和 `len` 方法取出它们，并独立的作为实际的系统调用参数。[第 8 条：熟悉引用和指针类型 - Effective Rust 中文版](https://rustx-labs.github.io/effective-rust-cn/chapter_1/item8-references&pointer.html#胖指针类型)与[Rust字符串胖指针到底是胖在栈上还是堆上了？ - 知乎](https://zhuanlan.zhihu.com/p/386488545).

在`usr_lib`中封装，更加接近在 Linux 等平台的实际体验，有

```rust
// user/src/lib.rs
use syscall::*;

pub fn write(fd: usize, buf: &[u8]) -> isize { sys_write(fd, buf) }
pub fn exit(exit_code: i32) -> isize { sys_exit(exit_code) }
```

由此可实现`console` 子模块中 `Stdout::write_str`.

> 执行和测试应用程序：在rCore-v3文档中，在实现操作系统前，直接执行和测试了应用程序，这是基于QEMU的用户态模拟`User mode`. 因为`system mode`模拟整个machine，可以运行其上的guest OS；而`user mode`是在host上运行一个guest的程序. 
>
> 参考 [qemu user mode速记 | Sherlock's blog](https://wangzhou.github.io/qemu-user-mode速记/).


### 特权级切换实现 

此处我们仅考虑当 CPU 在 U 特权级运行用户程序的时候触发 Trap，并切换到 S 特权级的批处理操作系统。

在 RISC-V 架构中，关于 Trap 有一条重要的规则：**在 Trap 前的特权级不会高于Trap后的特权级**。因此如果触发 Trap 之后切换到 S 特权级（Trap 到 S）， 说明 Trap 发生之前 CPU 只能运行在 S/U 特权级。操作系统会使用 S 特权级中与 Trap 相关的 **控制状态寄存器** (CSR, Control and Status Register) 来辅助 Trap 处理。

<a id="TrapCSR"></a>

| CSR 名      | 该 CSR 与 Trap 相关的功能                                    |
| ----------- | ------------------------------------------------------------ |
| **sstatus** | `SPP` 等字段给出 Trap 发生之前 CPU 处在哪个特权级（S/U）等信息 |
| sepc        | 当 Trap 是一个异常的时候，记录 Trap 发生之前执行的最后一条指令的地址 |
| scause      | 描述 Trap 的原因                                             |
| stval       | 给出 Trap 附加信息                                           |
| stvec       | 控制 Trap 处理代码的入口地址                                 |

涉及特权级切换的应用程序的调用情况[如图所示](#privilegeLevel). 应用程序的上下文可以分为通用寄存器和栈两部分。通用寄存器部分先前提及过；而对于栈，需要两个执行流，并且其记录的**执行历史**的栈所对应的内存区域不相交，就不会产生覆盖问题，无需进行保存/恢复。

<a id="privilegeLevel"></a>

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/EnvironmentCallFlow.png" alt="三态特权级切换" style="zoom:67%;" />


网上有一些博客对此有更详细的介绍：[RISC-V 32架构实践专题九（从零开始写操作系统-trap机制）_mtval寄存器-CSDN博客](https://blog.csdn.net/weixin_53479532/article/details/136611555), 与[rCore学习笔记 018-实现特权级的切换 - winddevil - 博客园](https://www.cnblogs.com/chenhan-winddevil/p/18327630). 在RISC-V Reader中也有关于CSR的描述.

#### 硬件控制: 寄存器

当 CPU 执行完一条指令并准备从用户特权级 Trap 到 S 特权级的时候，硬件会自动帮我们做这些事情：

- `sstatus` 的 `SPP` 字段会被修改为 CPU 当前的特权级（U/S）。
- `sepc` 会被修改为 Trap 回来之后默认会执行的下一条指令的地址。当 Trap 是一个异常的时候，它实际会被修改成 Trap 之前执行的最后一条 指令的地址。
- `scause/stval` 分别会被修改成这次 Trap 的原因以及相关的附加信息。
- CPU 会跳转到 `stvec` 所设置的 Trap 处理入口地址，并将当前特权级设置为 S ，然后开始向下执行。

而当 CPU 完成 Trap 处理准备返回的时候，需要通过一条 S 特权级的特权指令 `sret` 来完成，这一条指令具体完成以下功能：

- CPU 会将当前的特权级按照 `sstatus` 的 `SPP` 字段设置为 U 或者 S ；
- CPU 会跳转到 `sepc` 寄存器指向的那条指令，然后开始向下执行。

#### 用户栈与内核栈

在 Trap 触发的一瞬间， CPU 就会切换到 S 特权级并跳转到 `stvec` 所指示的位置。在正式进入 S 特权级的 Trap 处理之前，<u>我们必须保存**原执行流的寄存器状态**</u>，这一般通过**栈**来完成。

声明两个类型 `KernelStack` 和 `UserStack` 分别表示用户栈和内核栈，它们都只是字节数组的简单包装.

```rust
// os/src/batch.rs

const USER_STACK_SIZE: usize = 4096 * 2;
const KERNEL_STACK_SIZE: usize = 4096 * 2;

#[repr(align(4096))]
struct KernelStack {
	data: [u8; KERNEL_STACK_SIZE],
}

#[repr(align(4096))]
struct UserStack {
	data: [u8; USER_STACK_SIZE],
}

static KERNEL_STACK: KernelStack = KernelStack { data: [0; KERNEL_STACK_SIZE] };
static USER_STACK: UserStack = UserStack { data: [0; USER_STACK_SIZE] };
```

常数 `USER_STACK_SIZE` 和 `KERNEL_STACK_SIZE` 指出内核栈和用户栈的大小分别为 8KiB，以全局变量的形式实例化在批处理操作系统的 .bss 段中。

为两个类型实现了 `get_sp` 方法来获取栈顶地址。由于在 RISC-V 中栈是向下增长的，我们只需返回包裹的数组的终止地址，以用户栈类型 `UserStack` 为例：

```rust
impl UserStack {
	fn get_sp(&self) -> usize {
		self.data.as_ptr() as usize + USER_STACK_SIZE
	}
}
```

**换栈**是非常简单的，只需将 `sp` 寄存器的值修改为 `get_sp` 的返回值即可.

接着，是Trap上下文 `TrapContext`，即在 Trap 发生时需要保存的物理资源内容，并将其一起放在一个名为 `TrapContext` 的类型中，定义如下：

```rust
// os/src/trap/context.rs
#[repr(C)]
pub struct TrapContext {
	pub x: [usize; 32],
	pub sstatus: Sstatus,
	pub sepc: usize,
}
```

包含所有的通用寄存器 `x0`~`x31` ，还有 `sstatus` 和 `sepc` . 

#### Trap管理

在批处理操作系统初始化的时候，我们需要修改 `stvec` [寄存器](#TrapCSR)来指向正确的 Trap 处理入口点。

```rust
// os/src/trap/mod.rs
core::arch::global_asm!(include_str!("trap.S"));
pub fn init() {
	extern "C" { fn __alltraps(); }
	unsafe {
		stvec::write(__alltraps as usize, TrapMode::Direct);
	}
}
```

## ch3 特权级切换

从 `syscall` 开始，`syscall` 的调用次数是在 `TaskControlBlockInner` 下的 `TaskInfoBlock` 自定义模块下的哈希表中被定义，自定义的任务运行时间统计 `RunningTimeInfo` 也在于此。获取任务的信息，就是访问这个 `TaskInfoBlock`.

```rust
#[derive(Debug, Clone, PartialEq)]
pub struct TaskInfoBlock {
    pub syscall_times: BTreeMap<usize, u32>,
    pub running_times: RunningTimeInfo,
}
```

进入 `trap_hander` 意味着从用户态进入了内核态，此时停止用户态计时开启内核态计时，返回用户态时相反. `Processor` 中定义的 `user_timer_us` 和 `kernel_timer_us` 是一个临时的值，在调用计时停止的函数时，会将值赋给具体任务中的计时器。

```rust
pub fn trap_handler() -> ! {
    user_timer_stop();
    kernel_timer_start();
    ...
    kernel_timer_stop();
    user_timer_start();
    trap_return();
}
```

在进程转为 `Blocked` , `Ready(Suspended)` 或退出时会终止内核态计时，在 `task_current_task` 中。线程调度(schedule)时会开启内核态计时。这应当是没错的，因为只有程序处于 `Running` 状态时，才被认为是在执行。而进程状态的转换必须在内核态实现。在进程调度之后，开启新进程的内核态计时，之后通过 `trap_hander` 切回用户态。也就是说，此处进程状态的改变是旧进程内核态的结束和新进程内核态的开始。

在第一次运行任务时会更新第一次运行得时间并开启用户态计时。在 `sys_task_info` 中得到的时间根据要求是当前时间减去第一次运行的时间。

***

全局的 `PROCESSOR` 便于获取当前CPU上运行任务的状态。

上下文切换是通过 `__alltraps` 和 `__restore` 实现的. `__alltraps` 将 Trap 上下文保存在内核栈上，然后跳转 `trap_handler`（通过 `jr t1` 语句）；返回之后，`__restore` 从保存在内核栈上的 Trap 上下文恢复寄存器。

`schedule` 中的 `__switch` 将当前的 `TaskContext` 指针和 `idle_task_cx_ptr` 交换，而 `run_task` 将 `idle_task_cx_ptr` 与下一个任务的交换。被切换的任务会将其 PCB 放入 `TASK_MANAGER` 的 `ready_queue` 中。

事实上，它是来自两个不同应用的 Trap 执行流之间的切换。调用 `__switch` 之后直到它返回前的这段时间，原 Trap 执行流会先被暂停并被切换出去，CPU 转而运行另一个应用的 Trap 执行流。之后，原 Trap 执行流会从某一条 Trap 执行流（很可能不是之前切换到的那一条）切换回来继续执行，并最终返回。从实现的角度， `__switch` 和一个普通的函数之间的差别仅仅是它会换栈。

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/task_context.png" alt="Trap Hander1" style="zoom:67%;" />

`__switch`在内核栈上的整体流程为：

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/switch-1.png" style="zoom:67%;" />

阶段 [2]中，A 在自身的内核栈上，分配一块任务上下文的空间，在里面保存 CPU 当前的寄存器快照。

阶段 [3]中，读取 B 的 `task_cx_ptr` 或者说 `task_cx_ptr2` 指向的那块内存，获取到 B 的内核栈栈顶位置，并复制给 `sp` 寄存器来换到 B 的内核栈。**换栈也就实现了执行流的切换** 。

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/switch-2.png" style="zoom:67%;" />

结果上，A 执行流 和 B 执行流的状态发生了互换， A 在保存任务上下文之后进入**暂停**状态，而 B 则**恢复**了**上下文**并在 CPU 上执行。

`TASK_MANAGER` 是 `TaskManager` 的静态全局变量，掌管任务的就绪队列和终止队列。同一文件下的 `PID2PCB` 是由 `pid` 到 PCB 的 KV 键值对。

## ch4 内存管理

### SATP, PTE and Address

首先要做的是区分 `satp` (Supervisor Address Translation and Protection) , PTE 和 具体的地址。

`satp` 用于控制分页的宏观状态，这和字长保持一致。例如RV64就以高4位作为MODE，16位ASID，剩下44位为PPN. 此处的PPN表示根页表的**物理**页号。

PTE是页表项，有64位。保存的是3级PPN和VRWX等各标志位，高位为 Reserved.

然后才是Sv39，意味着39位页式虚拟地址，而物理地址的位数是56. 此处的位数在于：地址偏移12位由单个页面的大小 4 KiB 决定，虚拟页号即 39 - 12 = 27 位。物理地址的位数除去 12 位偏移量，似乎根据每级页表页号的长度所决定，rCore采取 56 位，也存在 50 位的物理地址。但其至少需要与 PTE 中的 PPN 长度一致：如果 Reserved 为 10，PPN分别为26, 9, 9则PPN就为44位，如果 Reserved 为 16，对应的物理页号就会短一些？此处存疑，一般都按56位的物理地址设计。

`PageTableEntry` = `PhysPageNum` + `PTEFlags`. `PTEFlags` 就是各标志位VRWX等的集合。

```rust
/// Create a new page table entry
pub fn new(ppn: PhysPageNum, flags: PTEFlags) -> Self {
	PageTableEntry {
		bits: ppn.0 << 10 | flags.bits as usize,
	}
}
```

`VirtAddr` 和 `PhysAddr` 都是对 `usize` 的封装。

***

### FrameAllocator

然后就需要考虑物理页帧的分配回收，就有了 `FrameAllocator(Trait)` ，具体作用在 `StackFrameAllocator` 上. `StackFrameAllocator` 是对页号的分配实现对页帧的分配。

```rust
pub struct StackFrameAllocator {
    current: usize,
    end: usize,
    recycled: Vec<usize>,
}
```

`FRAME_ALLOCATOR` 是 `StackFrameAllocator` 封装后的全局实例，管理全局的物理页帧分配。

```rust
type FrameAllocatorImpl = StackFrameAllocator;
lazy_static! {
    /// frame allocator instance through lazy_static!
    pub static ref FRAME_ALLOCATOR: UPSafeCell<FrameAllocatorImpl> =
        unsafe { UPSafeCell::new(FrameAllocatorImpl::new()) };
}
```

`FrameTracker` 是对 `PhysPageNum` 运用 RAII 思想的封装，`frame_alloc` 将会调用 `FRAME_ALLOCATOR` 下的 `alloc()` 返回包裹 `FrameTracker` 的 `Option`.

```rust
/// tracker for physical page frame allocation and deallocation
pub struct FrameTracker {
    /// physical page number
    pub ppn: PhysPageNum,
}
```

```rust
impl FrameAllocator for StackFrameAllocator {
	fn alloc(&mut self) -> Option<PhysPageNum> {
		if let Some(ppn) = self.recycled.pop() {
			Some(ppn.into())
		} else if self.current == self.end {
			None
		} else {
			self.current += 1;
			Some((self.current - 1).into())
		}
	}
}

pub fn frame_alloc() -> Option<FrameTracker> {
    FRAME_ALLOCATOR
        .exclusive_access()
        .alloc()
        .map(FrameTracker::new)
}
```

***

### PageTable

`PageTable` 即页表实现，保存 `root_ppn` 根节点页号。

```rust
pub fn get_pte_array(&self) -> &'static mut [PageTableEntry] {
	let pa: PhysAddr = (*self).into();
    unsafe { core::slice::from_raw_parts_mut(pa.0 as *mut PageTableEntry, 512) }
}
```

`get_pte_array()` 将当前物理页号转换为物理地址后，让物理地址成为指向页表项的指针，并获取 512 个页表条目。

`find_pte_create` 就是不断从虚拟页号 `vpn` 中使用 `get_pte_array` 获取页表项后再取 `ppn (or as root_ppn for the next PageTable)` 的过程，就是从 `vpn` 到 `PTE`. 创建页表项的过程会将其推入 `PageTable` 下的 `Vec<FrameTracker>`，在页表销毁后物理页帧就会被回收。

`map` 就是用 `find_pte_create` 获取 `PTE` 后将其内容修改为 `PhysPageNum` + `PTEFlags`. `unmap` 就是将其修改为 `PTE::empty()`. `translate` 在 `find_pte` 基础上加了一个解引用，`translate_va` 是 `VirtAddr` 到 `PhysAddr` 的映射。

```rust
pub fn map(&mut self, vpn: VirtPageNum, ppn: PhysPageNum, flags: PTEFlags) {
	let pte = self.find_pte_create(vpn).unwrap();
	assert!(!pte.is_valid(), "vpn {:?} is mapped before mapping", vpn);
	*pte = PageTableEntry::new(ppn, flags | PTEFlags::V);
}

pub fn translate(&self, vpn: VirtPageNum) -> Option<PageTableEntry> {
	self.find_pte(vpn).map(|pte| *pte)
}

pub fn translate_va(&self, va: VirtAddr) -> Option<PhysAddr> {
	self.find_pte(va.clone().floor()).map(|pte| {
		let aligned_pa: PhysAddr = pte.ppn().into();
		let offset = va.page_offset();
		let aligned_pa_usize: usize = aligned_pa.into();
		(aligned_pa_usize + offset).into()
	})
}
```

***

### MemorySet

为了表达一串连续的虚拟地址，以及与之对应的更宏观的地址空间抽象。

`MapArea` 就是对连续的**虚拟地址**的表示，`VPNRange` 表示虚拟页号的范围； `BTreeMap<VirtPageNum, FrameTracker>` 是表示虚实地址映射的KV键值对；`MapType` 是映射方式，恒等映射就是将虚拟地址直接作为物理地址使用，`Framed` 意味着虚拟页面对应一个新的物理页帧；`MapPermission` 是 `PTEFlags` 的子集，仅一些简单的标志位，注意区分 `MapPermission` 是逻辑段的，而 `PTEFlags` 是 `PageTableEntry` 的一部分。

```rust
pub struct MapArea {
    vpn_range: VPNRange,
    data_frames: BTreeMap<VirtPageNum, FrameTracker>,
    map_type: MapType,
    map_perm: MapPermission,
}
```

`MemorySet` 就是将 `PageTable` 和各 `MapArea` 组合为一个整体，地址空间是一系列有关联的逻辑段，这样就将虚拟地址、页表整合起来，形成一个地址空间供进程使用。虽然是同义复写但是不得不这么做，因为地址空间的意义就在于它是一个地址空间。

```rust
pub struct MemorySet {
    page_table: PageTable,
    areas: Vec<MapArea>,
}
```

内核代码的访存地址也是一个虚拟地址，需要经过MMU，由此构造而得内核地址空间。但是在rCore-Tutorial中，采用不同于以往的内核与应用同属同一地址空间而分上下两部分的设计（这点可以在《RISC-V体系结构编程与实践》中找到，180页），而是采用[全隔离内核](https://rustmagazine.github.io/rust_magazine_2021/chapter_7/trampoline-kernel.html)，因此才有跳板页（似乎 xv6 也是如此设计）。

根据寻址范围和Sv39的规定，地址空间有高 256GiB 和低 256GiB 的区分，具体可见于[最高的256GB与最低的256GB](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter4/3sv39-implementation-1.html#high-and-low-256gib)中。

内核地址空间中，最高的虚拟页面是一个跳板页，然后是**各应用的内核栈**，各内核栈之间用保护页面 (Guard Page) 隔开。低 256 GiB 是内核的 `.text/.rodata/.data/.bss` 等各逻辑段，恒等映射至物理内存。应用地址空间的高位也是跳板页，与内核地址空间不同的是多了一个 Trap 上下文。低 256 GiB 是各逻辑段和一个带保护页面的用户栈。布局可见于[内核地址空间](https://learningos.cn/rCore-Camp-Guide-2024A/chapter4/5kernel-app-spaces.html#id5)和[应用地址空间](https://learningos.cn/rCore-Camp-Guide-2024A/chapter4/5kernel-app-spaces.html#id6). 

内核的低位地址空间是通过 `Memory::new_kernel()` 创建的. 思路就是创建一个裸露的地址空间之后从低向高推入各逻辑段. 应用地址空间通过 `user/src/linker.ld` 以分配，`BASE_ADDRESS` 设置为 `0x0` 这一虚拟地址并向高位增长. 

此处一个比较重要的认识，就是 FFI 实际上就是对地址的操作，并无特殊之处，只不过这个地址从外部符号导入. 应用地址空间的创建通过 `from_elf()`，实现逻辑就是将各段用 `xmas_elf` 取出然后推入应用地址空间的对应位置中.

`KERNEL_SPACE` 作为**内核地址空间的全局实例**。关于将 Trap 上下文保存在次高页面而不是内核栈，是因为在内核栈中保存上下文需要先切换到内核地址空间，即使用 `satp` 切换页表，然后再使用一个通用寄存器保存内核栈栈顶指针，但硬件无法同时保存两个信息。

`map_trampoline` 是结合汇编和链接脚本等综合实现的，比较复杂而且过于细节，作用就是添加一个跳表页。

### What is modified?

进行了如上改动后，在 `TaskControlBlock` 中加入应用的地址空间 `memory_set` 和应用地址空间次高页的 Trap 上下文的物理页号 `trap_cx_ppn`. 这里直接使用物理页号应当是提高查找效率? `kernel_stack_position(app_id)` 获取当前应用对应的内核栈位置，可以通过在内核地址空间的位置计算而得。`insert_framed_area` 会实际将此内核栈的逻辑段加入内核地址空间中。这一部分后来发生了改写。

`PhysPageNum::get_mut<T>` 实现了一个泛型，用于获取一个物理地址所指向内容的可变引用，这一实现基于可以参考 `PhysAddr::get_mut<T>` 和 `as_mut()` 的例子 `ptr.as_mut().unwrap()`. 使 `get_trap_cx` 做到了根据物理页号取得对应的 `TrapContext`.

```rust
impl PhysAddr {
    /// Get the mutable reference of physical address
    pub fn get_mut<T>(&self) -> &'static mut T {
        unsafe { (self.0 as *mut T).as_mut().unwrap() }
    }
}
```

`app_init_context` 用于实现应用的上下文初始化，此处基于对 `TrapContext` 的改动加了新内容。Ch4 在内核初始化时将所有应用加载至全局应用管理器 `TASK_MANAGER` 中，这里后来发生了改写。`stvec` 寄存器设置内核态中断处理流程的入口地址，在 `trap_handler` 中添加 `set_kernel_trap_entry`，但是从 S 态到 S 态的 Trap 但是要到第九章才实现.

```rust
pub fn init() {
    set_kernel_trap_entry();
}
/// set trap entry for traps happen in kernel(supervisor) mode
fn set_kernel_trap_entry() {
    extern "C" {
        fn __trap_from_kernel();
    }
    unsafe {
        stvec::write(__trap_from_kernel as usize, TrapMode::Direct);
    }
}
```

`trap_handler` 还添加了一些对其他寄存器的内容的 log. 返回用户态的 `trap_return` 也做了一些改写适应跳板页和新的内存布局. `translated_byte_buffer` 以向量的形式返回以字节数组切片为类型的数组，在使用 `UserBuffer` 前的本章直接使用 `print!("{}", core::str::from_utf8(buffer).unwrap());` 作为 `sys_write`，可以参考 `str::from_utf8` 的例子理解此处的调用。

```rust
/// Create mutable `Vec<u8>` slice in kernel space from ptr in other address space. NOTICE: the content pointed to by the pointer `ptr` can cross physical pages.
pub fn translated_byte_buffer(token: usize, ptr: *const u8, len: usize) -> Vec<&'static mut [u8]> {
    let page_table = PageTable::from_token(token);
    let mut start = ptr as usize;
    let end = start + len;
    let mut v = Vec::new();
    while start < end {
        let start_va = VirtAddr::from(start);
        let mut vpn = start_va.floor();
        let ppn = page_table.translate(vpn).unwrap().ppn();
        vpn.step();
        let mut end_va: VirtAddr = vpn.into();
        end_va = end_va.min(VirtAddr::from(end));
        if end_va.page_offset() == 0 {
            v.push(&mut ppn.get_bytes_array()[start_va.page_offset()..]);
        } else {
            v.push(&mut ppn.get_bytes_array()[start_va.page_offset()..end_va.page_offset()]);
        }
        start = end_va.into();
    }
    v
}
```

## ch5 进程调度

本章开始，`TaskManager` 中处理器管理相关的内容被抽离出来，由 `Processor` 控制。

### TaskControlBlock

设计 `PidHandle` 来管理对 `pid` 的分配，与先前的 `FrameAllocator` 非常相似，结构上仅仅是删除了 `end` 因为不像栈一样存在限制。类似的，例化全局实例 `PID_ALLOCATOR`. 而一个内核栈 `KernelStack` 对应一个 `pid`. 此处 rCore 的代码与文档之间存在差异。`PID_ALLOCATOR` 和 `KSTACK_ALLOCATOR` 都是对 `RecycleAllocator` 的全局例化，`KernelStack::new` 被公有函数 `kstack_alloc` 所取代，原理不变仍是将 `KSTACK_ALLOCATOR` 分配得到的内核栈插入全局的内核地址空间 `KERNEL_SPACE` 中，使用 `insert_franed_area` 实现。

```rust
pub struct RecycleAllocator {
    current: usize,
    recycled: Vec<usize>,
}
```

```rust
/// allocate a new kernel stack
pub fn kstack_alloc() -> KernelStack {
    let kstack_id = KSTACK_ALLOCATOR.exclusive_access().alloc();
    let (kstack_bottom, kstack_top) = kernel_stack_position(kstack_id);
    KERNEL_SPACE.exclusive_access().insert_framed_area(
        kstack_bottom.into(),
        kstack_top.into(),
        MapPermission::R | MapPermission::W,
    );
    KernelStack(kstack_id)
}
```

`TaskControlBlock` 更改为如下构成：

```rust
pub struct TaskControlBlock {
    // Immutable
    /// Process identifier
    pub pid: PidHandle,
    /// Kernel stack corresponding to PID
    pub kernel_stack: KernelStack,
    /// Mutable
    inner: UPSafeCell<TaskControlBlockInner>,
}
```

`PidHandle` 和 `KernelStack` 是初始化后不再变化的字段，可能发生变化的则放入 `TaskControlBlockInner` 中，如 Trap 上下文的物理页号 `trap_cx_ppn`, 上下文 `task_cx` 和应用地址空间 `memory_set` 等，注意上下文和 Trap 上下文存在区别，分别用于进程调度和特权级切换，保存的内容也分别是内核态执行状态和用户态执行状态。

### TaskManager & Processor

`TaskManager` 是一个关于 `Arc<TaskControlBlock>` 类型的 `VecDeque` 队列，具体方法比较简单，`TASK_MANAGER` 是其全局实例。`Processor` 由 `current:Option<Arc<TaskControlBlock>>` 和 `idle_task_cx:TaskContext` 组成，分别表示当前处理器上正在执行的任务和当前处理器上 idle 控制流的任务上下文。`PROCESSOR` 是其全局实例。

```rust
///A array of `TaskControlBlock` that is thread-safe
pub struct TaskManager {
    ready_queue: VecDeque<Arc<TaskControlBlock>>,
}
```

```rust
/// Processor management structure
pub struct Processor {
    ///The task currently executing on the current processor
    current: Option<Arc<TaskControlBlock>>,
    ///The basic control flow of each core, helping to select and switch process
    idle_task_cx: TaskContext,
}

lazy_static! {
    pub static ref PROCESSOR: UPSafeCell<Processor> = unsafe { UPSafeCell::new(Processor::new()) };
}
```

`run_tasks` 在任务管理器 `TASK_MANAGER` 取出 ( `fetch_task` ) 相应任务后，进行上下文切换。由于用 `loop` 包裹，将会循环取出任务并进行任务切换，不过 `__switch` 后会切出这个函数。对于 `__switch` 函数，内核先把 `current_task_cx_ptr` 中的寄存器值保存在当前指针的经过偏移的地址下，再将 `next_task_cx_ptr` 的寄存器恢复，具体可见[任务切换](https://learningos.cn/rCore-Camp-Guide-2024A/chapter3/2task-switching.html?highlight=__switch)，由此实现各寄存器值的切换。而 `schedule` 由 `suspend_current_and_run_next` 调用，当应用交出 CPU 使用权后，实施将当前进程挂起为`TaskStatus::Ready`后的上下文切换操作，将当前上下文保存并切换为`idle_task_cx`的上下文。切换回去之后，内核将跳转到 `run_tasks` 中 `__switch` 返回之后的位置，也即开启了下一轮的调度循环。根据[评论](https://github.com/rcore-os/rCore-Tutorial-Book-v3/issues/47#issuecomment-1109562363)的理解，使用空上下文实现了解耦。这一段就是调度的具体实现，并非调度算法。

```rust
///The main part of process execution and scheduling
///Loop `fetch_task` to get the process that needs to run, and switch the process through `__switch`
pub fn run_tasks() {
    loop {
        let mut processor = PROCESSOR.exclusive_access();
        if let Some(task) = fetch_task() {
            ...
            unsafe {
                __switch(idle_task_cx_ptr, next_task_cx_ptr);
            }
        } else {
            warn!("no tasks available in run_tasks");
        }
    }
}
```

`add_initproc` 在 `main` 中被调用，作用是将全局的 `INITPROC` 加入 `TASK_MANAGER` 中.

```rust
///Add init process to the manager
pub fn add_initproc() {
    add_task(INITPROC.clone());
}
```

### Syscall

`fork` 就是创建另一个 `TaskControlBlock`, 而这个子进程和父进程拥有**初始一致但独立的地址空间和文件描述符表**，当然 `pid` 必然不同。设计的难点在于 `MemorySet::from_existed_user`, 可以理解为 `MemorySet` 的 `clone` 方法，这复制一个完全相同的地址空间，通过对 `MapArea` 下 `vpn_range` 对应 `ppn` 数据的修改，将原地址空间的数据复制到另一个地址空间中. `sys_fork` 在创建子进程时唯一的区别是，子进程的返回值为 0. 因此需要取 `trap_cx` 并将 `a0` 寄存器赋 0. 

```rust
impl MemorySet {
    pub fn from_existed_user(user_space: &Self) -> Self {
        let mut memory_set = Self::new_bare();
        // map trampoline
        memory_set.map_trampoline();
        // copy data sections/trap_context/user_stack
        for area in user_space.areas.iter() {
            let new_area = MapArea::from_another(area);
            memory_set.push(new_area, None);
            // copy data from another space
            for vpn in area.vpn_range {
                let src_ppn = user_space.translate(vpn).unwrap().ppn();
                let dst_ppn = memory_set.translate(vpn).unwrap().ppn();
                dst_ppn
                    .get_bytes_array()
                    .copy_from_slice(src_ppn.get_bytes_array());
            }
        }
        memory_set
    }
}
```

`exec` 加载一个新的 ELF 文件并替换原有应用地址空间的内容. `sys_exec` 先通过 `translated_str` 将该地址所对应的内容以 `char` 类型翻译后传回 `String`，然后返回 ELF 格式的数据并执行 `exec` 替换当前进程的应用地址空间. 由于执行 `sys_exec` 时原有的地址空间会被销毁，各物理页帧都会被回收，为了应对失效的上下文 `cx`, 在 `ProcessControlBlock::exec` 中需要对 `trap_handler` 重建 `cx`.

`sys_waitpid` 寻找当前进程子进程中符合 `pid` 且为僵尸进程的进程，将其回收，附带有对 `exit_code` 的处理和对旧 `pid` 的返回.

## ch6 文件系统

### File Trait & UserBuffer

所有的文件访问都可以通过一个抽象接口 `File` 这一 Trait 进行，具体实现上是 `Send + Sync`. 这为文件访问提供了并发的能力，参见[基于 Send 和 Sync 的线程安全](https://course.rs/advance/concurrency-with-threads/send-sync.html#send-%E5%92%8C-sync).

```rust
/// trait File for all file types
pub trait File: Send + Sync {
    /// the file readable?
    fn readable(&self) -> bool;
    /// the file writable?
    fn writable(&self) -> bool;
    /// read from the file to buf, return the number of bytes read
    fn read(&self, buf: UserBuffer) -> usize;
    /// write to the file from buf, return the number of bytes written
    fn write(&self, buf: UserBuffer) -> usize;
}
```

定义于 `mm` 模块中的 `UserBuffer` 是应用地址空间的一段缓冲区，文档中说这可以被理解为 `&[u8]` 切片，这似乎具有一定的二义性，就从类型 `pub buffers: Vec<&'static mut [u8]>` 理解即可. 这实际上是一组 utf8 编码构成的数组，在 `Stdout` 的 `write` 方法中直接使用了 `from_utf8(*buffer)`. 参见[from_utf8](https://doc.rust-lang.org/std/str/fn.from_utf8.html). 

```rust
/// An abstraction over a buffer passed from user space to kernel space
pub struct UserBuffer {
    /// A list of buffers
    pub buffers: Vec<&'static mut [u8]>,
}
```

`UserBuffer` 与 `translated_byte_buffer` 方法是对应的，返回向量形式的字节 (`u8`) 数组切片，内核空间可以访问. 理清 `UserBuffer` 后，在此基础上构建了 `Stdin::read` 和 `Stdout::write`.

### fd_table

每个进程都带有一个文件描述符表 `fd_table`，记录请求打开并可以读写的文件集合。此表对应有文件描述符 (File Descriptor, `fd`) 以一个非负整数记录对应文件位置。`open` 或 `create` 会返回对应描述符，而 `close` 需要提供描述符以关闭文件。

在 `TaskControlBlockInner` 中就有 `pub fd_table: Vec<Option<Arc<dyn File + Send + Sync>>>`. 包含了共享引用和诸多特性，文档里有详细的解释. 其中 `dyn` 就是一种运行时多态. 在 fork 时，子进程完全继承父进程的文件描述符表，由此共享文件. 新建进程时，默认先打开标准输入文件 `Stdin` 和标准输出文件 `Stdout`.

`sys_write` 和 `sys_read` 根据对应的文件描述符 `fd` 从当前进程的 `fd_table` 中取出文件并执行对应的读写操作.

### easy-fs

#### BlockDevice

文件系统自底向上共有五层。最底部是块的抽象接口`BlockDevice` Trait 基于`Send + Sync + Any`实现，其中`Any`是模拟动态类型的特性，参看[Any in std::any](https://doc.rust-lang.org/std/any/trait.Any.html). 两个方法`read_block`和`write_block`都以 Buffer 为中介与磁盘上的块进行读写.
#### BlockCache

往上是块 Cache , 用内存作为磁盘块的缓存以加速IO操作. 定义块缓存`BlockCache`

```rust
pub struct BlockCache {
    /// cached block data
    cache: [u8; BLOCK_SZ],
    /// underlying block id
    block_id: usize,
    /// underlying block device
    block_device: Arc<dyn BlockDevice>,
    /// whether the block is dirty
    modified: bool,
}
```

块缓存`BlockCache`内含一个 512 字节的数组，即以`u8`为一个字节，长度为`BLOCK_SZ = 512` 的`[u8; BLOCK_SZ]`.  `cache`表示位于内存中的缓冲区，`block_device`表示所属的块设备. 享有方法`get_ref`和`get_mut`用于获取地址所对应内容的引用和可变引用，用闭包`f`进一步封装分别得到`read`和`modify`方法. 此处选择的闭包类型为`FnOnce`.

在此之上建立一个全局的块管理器`BlockCacheManager`用以管理内存中的`BlockCache`. 方法`get_block_cache`用于在队列中搜索对应块编号的磁盘块，若队列已满则使用类 FIFO 的算法将当前块载入队列中. 

```rust
/// BlockCacheManager is a manager for BlockCache.
pub struct BlockCacheManager {
    /// (block_id, block_cache)
    queue: VecDeque<(usize, Arc<Mutex<BlockCache>>)>,
}
```

由于我们希望内存中只能驻留有限的磁盘块缓冲区，我们定义`BLOCK_CACHE_SIZE = 16`. 从`BlockCacheManager`中获取块缓存时会检查队列的长度是否达到了`BLOCK_CACHE_SIZE`，如果达到就会发生缓存替换. 此处注意区别`BLOCK_CACHE_SIZE`是块缓存队列的长度上限，而`BLOCK_SZ`则是单个`BlockCache`中`cache`的大小.  

#### Layout & Bitmap

然后是其上磁盘数据结构层。这其中按块编号又分为五个区域：超级块、索引节点位图、索引节点区域`DiskInode`、数据块位图和数据块区域`DataBlock`.

每个位图`BitmapBlock`都由若干个块组成，每个 bit 代表一个索引节点或数据块的分配状态. 而`Bitmap`则作为位图的管理器记录位图区域的起始块编号的个数。

首先是`SuperBlock`存放在磁盘上编号为 0 的块起始处. 然后是位图`Bitmap`，由若干个块组成，块的大小`BLOCK_BITS`也是 512 字节，对应 $512 \times 8 = 4096 \ bits$. 每一个`bit`代表一个`inode/block`的分配状态.

```rust
pub struct Bitmap {
	start_block_id: usize,
	blocks: usize,
}
```

标明起始块编号和`Bitmap`所占的区域长度. 而

```rust
type BitmapBlock = [u64; 64];
```

是`Bitmap`的具体实现，存储`Bitmap`其上的数据. 解释 4096 为 $64 \times 64$ 的数组应该只是为了方便操作.

`alloc`在`bitmap_block`中找到一个空闲的 bit 并返回其位置，如果没有达到 `u64::MAX`，则通过 `u64::trailing_ones` 找到最低的一个 0 的位置. `BLOCK_BITS`是一个块大小的 bits 描述，不同于`BLOCK_SZ`的 Bytes 表述. `Bitmap`的`(block_pos, bits64_pos, inner_pos)`分别是，所处哪一个编号的内存块、第几组`bits64`组（组编号）、在`bits64`组中的第几`bit`（组内编号）.

***

接着讨论索引节点和目录项. 

```rust
#[repr(C)]
pub struct DiskInode {
    // file size
    pub size: u32,
    // direct address
    pub direct: [u32; INODE_DIRECT_COUNT],
    pub indirect1: u32,
    pub indirect2: u32,
    type_: DiskInodeType,
    // links_count: u32,
}
```

每个文件/目录在磁盘上均以`DiskInode`进行存储. `size` 表示其内容的字节数. 

一个块的编号用一个`u32`进行存储。索引方式分直接和间接两种，`direct`直接指向**数据块**，`indirect1`和`indirect2`分别指向一级和二级索引块。一级索引块中的每个`u32`指向一个数据块，而二级索引块的每个`u32`指向一个不同的一级索引块。一级索引块和二级索引块都位于**数据块区域中**。块的编号用一个`u32` (4 Bytes) 存储，一个索引块最多索引 $512 \ Bytes \div 4 \ Bytes = 128$ 个数据块 (`DataBlock`大小为 512 字节，定义为字节数组 `[u8; BLOCK_SZ]`) . 此处基于元数据的个数对`DiskInode`的大小进行了调整，当前为 128 字节.  

`get_block_id` 就是根据索引取出第 `block_id` 个数据块的块编号，用于后续对此数据块进行访问. `total_blocks` 的计数方法是类似于 `_data_blocks` 的. `increase_size` 用 `new_blocks.next()` 增加大小. `clear_size` 用类似的方法清空. `read_at` 将 `offset` 字节开始的部分读入内存缓冲区 `buf` 中.

以上是索引节点. 目录对应的目录项为一个二元组`DirEntry`. 目录项长 32 Bytes，每个数据块可以存 16 个目录项. 
```rust
pub struct DirEntry {
	name: [u8; NAME_LENGTH_LIMIT + 1],
	inode_number: u32,
}
```

#### EasyFileSystem

为了实现磁盘数据结构的整合，将所有的数据结构存储在内存上，实现**磁盘块管理器** `EasyFileSystem` 于 `efs.rs` 中. 包含设备指针 `block_device`，两个位图和对应起始编号. 

```rust
pub struct EasyFileSystem {
    ///Real device
    pub block_device: Arc<dyn BlockDevice>,
    ///Inode bitmap
    pub inode_bitmap: Bitmap,
    ///Data bitmap
    pub data_bitmap: Bitmap,
    inode_area_start_block: u32,
    data_area_start_block: u32,
}
```

`EasyFileSystem`可以由位图上的 bit 编号得知 inode 块 (`get_disk_inode_pos`) 和 数据块 (`get_data_block_id`) 在磁盘上的实际位置，同时实现了以及 inode 和 数据块的分配与回收. `EasyFileSystem::open`用于在装载了 easy-fs 镜像的块设备上打开 easy-fs，实际上就是把块编号为 0 的超级块读入.

`EasyFileSystem` 是一个扁平化的文件系统，在目录树上仅有一层目录，即作为根节点的根目录. 所有的文件都在根目录下.

#### VFS (Inode)

以上均为磁盘布局的处理，作为文件系统的暴露接口，最顶层的**索引节点层**如下. 相对于`DiskInode`放在磁盘中的固定位置，`Inode`作为内存中记录文件索引信息的具体数据结构. 根据其成员不难看出 `Inode` 是基于 `EasyFileSystem` 之上的实现. vfs 是为了让不同文件系统在同一个操作系统运行之上进行的抽象.

```rust
pub struct Inode {
    block_id: usize,
    block_offset: usize,
    fs: Arc<Mutex<EasyFileSystem>>,
    block_device: Arc<dyn BlockDevice>,
    // inode_id: u32,
}
```

其中 `block_id` 和 `block_offset` 记录该 `Inode` 对应的 `DiskInode` 于磁盘的具体位置. 差别在于 `DiskInode` 放在磁盘块中比较固定的位置，而 `Inode` 是放在内存中用以记录文件索引节点信息的数据结构. 依据 [Project rCore: 文件系统 - Xuewei's Blog](https://nxw.name/2022/project-rcore-file-system#toc_7) 的说法：尽管一个文件的所有数据块在物理上是分散的，而用户一般把文件看作是一个连续的二进制（逻辑上的）。那么这一层做的事情就显而易见了：**向上层屏蔽物理视角，提供喜闻乐见的逻辑视角**。

根据《现代操作系统：原理与实现》，Inode (index node) 也即我们实现的`DiskInode`，记录了一个文件所对应的所有存储块号，而为了实现文件名与文件具体存储位置的解耦，用**目录**记录文件名到 inode 的映射实现解耦. 目录是一种特殊类型的文件，记录了文件名到 inode 号的映射，而因为目录本身也是文件，就可以递归地组织文件系统中的文件. 常规文件保存用户数据，而目录中保存的就是目录项 `DirEntry`，每个目录项代表一条文件信息记录文件名到 inode 的映射.  书中 图 9-3 比较好的展示了其中的逻辑关系.

理解了逻辑视角后，剩下的都是方法的具体实现.

`find`以`find_inode_id`为底层实现，遍历（根）目录项下的目录项磁盘块，结果存入临时的目录项缓冲`dirent`中，判断名字是否相等以确定是否找到. 注意，所有暴露给文件系统的使用者的操作，全程均需持有 `EasyFileSystem` 的**互斥锁**.

`ls` 获取目录下所有文件的文件名. `clear` 调用 `dealloc_data` 用于清空文件. `read_at` 和 `write_at` 调用 `DiskInode` 的各自方法，也是以缓冲区作为中介. `append_dirent` 即建立文件名到 inode 的映射关系，比较常用.

一切我们应当实现的方法都集中在 `Inode` 接口上. `link_at`  就是将两个目录项的名称关联到同一 inode 上并增加链接数. `unlink_at` 的底层实现中 `find_entry_inode_id_and_index` 获取 idx 和 `swap_remove_dirent` 是对应关系， `swap_remove_dirent` 和 `swap_remove_back` 思想是类似的.

先前讨论的都是 `easy-fs`. 然后我们就可以使用 `EasyFileSystem` 选择性地将 ELF 应用程序文件加载进内存，这就是 `easy-fs-fuse` 的功能.

### FileSystem in Kernel (os/fs)

实现了文件系统后就要在内核中实现对接 `easy-fs` 的各种结构，自下而上分为块设备驱动、`easy-fs` 层、内核索引节点层、文件描述符层和系统调用层.

块设备驱动对接的是 Qemu, 使用 VirtIO 总线并对其 MMIO 区间进行配置. 在`drivers` 模块下.

`easy-fs` 层接受一个块设备 `BlockDevice` 并在其上打开文件系统 `EasyFileSystem`.

内核索引节点层将 `easy-fs` 中的 `Inode` 封装成 `OSInode`. 在 `fs` 模块下. `OSInode` 表示进程中一个被打开的常规文件或目录，描述了读写特性，又支持互斥访问和内部可变性. `offset` 是读写过程中的辅助偏移量.

文件描述符层就是将 `File` Trait 赋给 `OSInode`. 遍历 `UserBuffer` 中的缓冲区片段再调用 `Inode` 的 `read/write_at` 接口. 并且在进程 `TaskControlBlockInner` 中实现了文件描述符表 `fd_table`.

然后就是各系统调用 syscall 了，全局例化一个 `ROOT_INODE` 并修改相关的 syscall.

## ch7 进程间通信

### Pipe

管道是单项的 IPC，内核中通常有一定的缓冲区来缓存消息，通信的数据就是字节流。管道的创建会返回一组（两个）文件描述符，并使用内存作为数据的缓冲区，行为类似于 FIFO 队列，最早传入的数据会最先被读出。

IPC Pipe 定义如下

```rust
/// IPC pipe
pub struct Pipe {
    readable: bool,
    writable: bool,
    buffer: Arc<UPSafeCell<PipeRingBuffer>>,
}

pub struct PipeRingBuffer {
    arr: [u8; RING_BUFFER_SIZE],
    head: usize,
    tail: usize,
    status: RingBufferStatus,
    write_end: Option<Weak<Pipe>>,
}
```

管道自身是带有一定大小缓冲区的字节队列，抽象为 `PipeRingBuffer` 类型. `PipeRingBuffer` 中的 `arr/head/tail` 将一个循环队列. `write_end` 保存了写端的弱引用计数，在某些情况下，需要确认管道所有的写端是否都已经被关闭. `Pipe` 就是加了读写属性的 `PipeRingBuffer`.

以下讲解 `sys_pipe()` 方法，首先使用 `make_pipe` 方法创建一个管道并返回它的读端和写端，

```rust
/// Return (read_end, write_end)
pub fn make_pipe() -> (Arc<Pipe>, Arc<Pipe>) {
    let buffer = Arc::new(unsafe { UPSafeCell::new(PipeRingBuffer::new()) });
    let read_end = Arc::new(Pipe::read_end_with_buffer(buffer.clone()));
    let write_end = Arc::new(Pipe::write_end_with_buffer(buffer.clone()));
    buffer.exclusive_access().set_write_end(&write_end);
    (read_end, write_end)
}
```

然后用 `TaskControlBlockInner::alloc_fd` 分配一个空闲文件描述符来访问新打开的文件。尝试找到一个空闲，没有就拓展文件描述符表的长度并再分配. 然后调用 `translated_refmut` 获取物理地址，将读端和写端的文件描述符写回到应用地址空间.

`PipeRingBuffer::read_byte` 和 `PipeRingBuffer::write_byte` 分别是基于循环队列对缓冲区进行更改，比较简单. 然后对 `Pipe` impl `File` Trait, 实现读写操作. 以 `read` 为例 `loop_read` 来表示可从管道中读取多少字符。若管道为空且所有写端已关闭，则没有任何字符可以读取，直接返回；否则等待填充，先调用 `suspend_current_and_run_next` 切换到其他任务. 可读的字符数不为 0 就循环读取直至缓冲区满或读完. `write` 方法的实现原理是类似的.

### Command Args

为了实现命令行参数，在 `sys_exec` 中需要将参数的地址压入用户栈. 此处 `args` 指向命令行参数字符串的起始地址，每次通过 `translated_str` 拿到一个字符串 `String`.

在 `exec` 内需要将参数压栈，此处的地址转换比较复杂. 首先 `user_sp` 是从 `from_elf` 函数返回的地址，先将其 `user_sp -= (args.len() + 1) * core::mem::size_of::<usize>()` 由此预留出直到下图中 `agrv_base` 的空间，`argv[i]` 的**地址**依次填入 `agrv` 这一变长数组 `Vec` 中. 然后再从 `argv_base` 位置往低处拓展，`*argv[i] = user_sp` 将 `agrv[i]` 地址的**内容**依次以 `user_sp` 这一地址进行填充. `as_bytes` 将 `args[i]` 的 `String` 转换为 `&[u8]` 以保存在栈中，字符结尾赋 0. `user_sp -= user_sp % core::mem::size_of::<usize>()` 用于对齐.

```rust
// push arguments on user stack
user_sp -= (args.len() + 1) * core::mem::size_of::<usize>();
let argv_base = user_sp;
let mut argv: Vec<_> = (0..=args.len())
	.map(|arg| {
		translated_refmut(
			memory_set.token(),
			(argv_base + arg * core::mem::size_of::<usize>()) as *mut usize,
		)
	})
	.collect();
*argv[args.len()] = 0;

for i in 0..args.len() {
	user_sp -= args[i].len() + 1;
	*argv[i] = user_sp;
	let mut p = user_sp;
	for c in args[i].as_bytes() {
		*translated_refmut(memory_set.token(), p as *mut u8) = *c;
		p += 1;
	}
	*translated_refmut(memory_set.token(), p as *mut u8) = 0;
}
// make the user_sp aligned to 8B for k210 platform
user_sp -= user_sp % core::mem::size_of::<usize>();
```

内存布局示意图如下，在 rCore 之外可能需要对此布局进行更改，可以参考[Arceos 宏内核 lab1 report - AqStage](https://blog.aqpower.cn/index.php/archives/76/)的博文.

![img](https://rcore-os.cn/rCore-Tutorial-Book-v3/_images/user-stack-cmdargs.png#pic_center=600x600)

### I/O 重定向 (sys_dup)

应用中除非明确指明数据输入或输出的文件，否则数据默认都 输入自 进程文件描述表位置 0 处的标准输入，并输出到 进程文件描述符表位置 1 处的标准输出. 实现标准输入输出的重定向，就意味着对文件描述符表进行替换.

具体实现来说，在文件描述符表中分配一个新的文件描述符，并保存为 `fd` 指向的已打开文件的拷贝.

## ch8 并发

### Threads

线程建立在进程的地址空间抽象之上，每个线程都共享 进程的代码段和和可共享的地址空间（诸如全局数据段、堆等），但有自己的独占的栈.

在现有的进程管理上实现线程管理，需要把进程中处理器相关的部分移到 `TaskControlBlock` 中，形成线程. 我们以 `TaskControlBlock` 作为线程的数据结构，`TaskManager` 用于管理线程集合，`Processor` 进行线程调度以维持线程的处理器状态.

```rust
/// Task control block structure
pub struct TaskControlBlock {
    /// immutable
    pub process: Weak<ProcessControlBlock>,
    /// Kernel stack corresponding to PID
    pub kstack: KernelStack,
    /// mutable
    inner: UPSafeCell<TaskControlBlockInner>,
}

/// Inner of Process Control Block
pub struct ProcessControlBlockInner {
    ...
    /// tasks(also known as threads)
    pub tasks: Vec<Option<Arc<TaskControlBlock>>>,
    ...
}
```

线程共享进程的地址空间. 线程控制块包含线程初始化后不再变化的元数据，即所属进程和内核栈. 可能发生变化的元数据放在 `TaslControlBlockInner` 中，其中保存着线程各自运行所需的状态，即**上下文**；又有 `TaskUserRes` 包含线程标识符 `tid` 和线程的用户栈顶地址 `ustack_base`. 可以看出，线程拥有独立的内核栈与用户栈. `PID_ALLOCATOR` 和 `KSTACK_ALLOCATOR` 都基于 `RecycleAllocator` 是相比先前 `PidAllocator` 更泛用的版本.

```rust
/// User Resource for a task
pub struct TaskUserRes {
    /// task id
    pub tid: usize,
    /// user stack base
    pub ustack_base: usize,
    /// process belongs to
    pub process: Weak<ProcessControlBlock>,
}
```

每个进程拥有自己的进程标识符 (TID) ，可以使用 `sys_thread_create` 来创建一个线程. 这意味着在进程内部创建一个线程，该线程可以访问到进程所拥有的代码段， 堆和其他数据段。但内核会给这个新线程分配其专有的用户态栈. 由此实现每个线程的独立调度和执行. 同样的，每个线程也拥有一个独立的跳板页 `TRAMPOLINE`. 相比于 `fork` ，创建线程不需要建立新的地址空间. 线程之间也没有父子关系. 实现上比较简单，就是在新建 `TaskControlBlock` 后添加到 `tasks[new_task_tid]` 下.

线程用户态用到的资源会在 `exit` 系统调用后自动回收，而诸如内核栈等内核态线程资源则需要 `sys_waittid` 来回收以彻底销毁线程. 进程 / 主线程通过 `waittid` 来等待创建出的线程结束，并回收内核中的资源. `exit_current_and_run_next` 是比较繁琐的 **进程** 资源回收，由**主线程**发起. `sys_waittid` 是主线程进行调用，等待其他线程结束的方法，发现等待自身则返回，否则收集退出码 `exit_code` 清空此线程的线程控制块，因为 `Arc` 在引用计数为 0 时会自动释放.

### Mutex

从线程的视角来看，互斥是一种资源，因此在 `TaskControlBlockInner` 中存放有 `pub mutex_list: Vec<Option<Arc<dyn Mutex>>>`. 其具体实现为 `MutexBlock` 下的 `MutexBlockInner`.

```rust
pub struct MutexBlockingInner {
    locked: bool,
    wait_queue: VecDeque<Arc<TaskControlBlock>>,
}
```

`sys_mutex_create` 在当前进程中替换或新增一个互斥锁，此处会根据 `blocking` 参数决定是基于阻塞机制的阻塞锁 `MutexBlocking` 还是类似于 yield 机制的自旋锁 `MutexSpin`.  区别在于阻塞锁 `MutexBlocking` 维护一个等待队列，以 FIFO 唤醒任务保证公平；而自旋锁 `MutexSpin` 在解锁之后所有任务需要重新竞争，可能会引发饥饿. `MutexBlocking` 在彻底阻塞期间不存在 CPU 占用，零空转，适合高竞争的场景，但存在唤醒的调度开销；而 `MutexSpin` 没有任务切换开销但可能会导致频繁的上下文切换开销，若 CPU 频繁让出.

`sys_mutex_lock` 就是取出对应的 `mutex` 并上锁. `sys_mutex_unlock` 类似.

### Semaphore

 与 Mutex 类似，有 `pub semaphore_list: Vec<Option<Arc<Semaphore>>>`. 具体实现上，拥有一个信号量值和等待列表.

```rust
pub struct SemaphoreInner {
    pub count: isize,
    pub wait_queue: VecDeque<Arc<TaskControlBlock>>,
}
```

信号量的值表示资源数量，当其小于或等于 0 时会进入循环等待. 只有在信号量大于 0 时，才停止等待并消耗资源. P & V 操作分别对应 `down` 和 `up` 方法. 使用 `down` 方法，如果此时信号量小于 0 就将当前任务推入 `wait_queue` 中，并阻塞当前任务. 而 `up` 方法就是在小于或等于 0 时弹出 `wait_queue` 中的任务并对其唤醒.

### Condvar

可以考虑一个生产者消费者模型，剩余空位为 0 时，生产者会进入 循环等待 的状态，浪费了 CPU 资源. 条件变量便是满足这类需求而设计的一种 挂起 / 唤醒 机制. 通过条件变量接口，一个线程可以停止使用 CPU 并将自己挂起，等到条件满足时再由其他线程唤醒并继续执行. 一般条件变量与互斥锁搭配使用.

2025S 的文档在谈论条件变量时与管程一同讨论，但管程更应该是部分高级语言上的同步原语接口抽象，例如 Java. Rust 并不在语言上支持管程机制，rCore 只是手动加入互斥锁的方式代替编译器. 

对于条件变量，同理有 `pub condvar_list: Vec<Option<Arc<Condvar>>>`. 在实现上

```rust
pub struct CondvarInner {
    pub wait_queue: VecDeque<Arc<TaskControlBlock>>,
}
```

有 `wait` 和 `signal` 方法， 分别用于挂起当前进程和唤醒等待进程. 实现上 `signal` 比较简单，就是用 `wakeup_task` 将等待队列中的线程唤醒，而 `wait` 复杂一些：先将锁释放后，将自己以阻塞的方式挂起并进入等待队列中，待到被唤醒后再获取锁. 这意味着，在 `wait` 挂起后，互斥锁 `mutex` 通过 `unlcok` 被原子地释放，允许其他线程进入此临界区，若满足线程等待的条件，将会调用 `signal` 以唤醒线程，此时重新获取互斥锁 `mutex`. 此处参考了《现代操作系统：原理与实现》，理解条件变量最好先接触使用条件变量的程序. Syscall 上就是对指定 `condvar_id` 调用 `wait` 和 `signal`. 

### BankerAlgo

在死锁出现的四个必要条件中，只有循环等待和实际状况相关. 我们可以通过分析资源分配 / 等待图以发现死锁，解除死锁就意味着打破循环等待关系. 我们可以通过对系统运行时资源分配的管理来避免死锁. 一个系统存在两种状态：安全状态和非安全状态. 安全状态一定不会出现死锁，非安全状态可能导致死锁. 避免死锁算法就是让每一次资源分配后，系统都处于安全状态.

银行家算法是死锁避免中的一种具体策略. 设系统中存在 M 类资源和 N 个线程，有以下四种数据结构：

- `Available[M]` 系统此时 M 类资源各自可用个数
- `Max[N][M]` 线程对资源的最大需求量
- `Allocation[N][M]` 已分配的资源数量
- `Need[N][M]` 还需要的资源数量

思路为模拟资源分配后，检查系统是否还处于安全状态. 具体而言：

1. 创建临时数组 `Available_sim` 表示运行时动态变化的 M 类各自可用资源的个数，在 2025S 中用 `Work` 表示. 先前的 `Available` 可以认为是整个系统的资源最大量，不会变化.
2. 找到一个线程 `x` 满足其分配需求即 `Available[m]` >= `Need[x][m]` 对 M 类资源都成立. 若找不到则说明系统处于非安全状态.
3. 线程得到资源后执行. 执行完成后释放资源. 执行 `Available_sim[m] += Allocation[x][m]`. 标记 `x` 线程执行结束.
4. 遍历所有，查看是否有未执行结束的线程. 如果有就返回第二步，否则代表系统处于安全状态.

在 [银行家算法](https://zh.wikipedia.org/wiki/%E9%93%B6%E8%A1%8C%E5%AE%B6%E7%AE%97%E6%B3%95) 中的伪代码也清晰地说明了实现思路. 不过其 `Need` 以 `Max - Allocation` 表示.

考虑在 rCore 中实现，对于 `BankerAlgorithm`

```rust
#[derive(Debug, Default)]
/// Banker algorithm data structure for single process
pub struct BankerAlgorithm {
    /// Available map, (Resource) = available number
    available: BTreeMap<ResourceIdentifier, NumberOfResources>,
    /// (Task, Resource) = Resource {allocation, need}
    task_state: BTreeMap<TaskIdentifier, BTreeMap<ResourceIdentifier, TaskResourceState>>,
}

#[derive(Debug, Default)]
pub struct TaskResourceState {
    // max: NumberOfResources,
    allocation: NumberOfResources,
    need: NumberOfResources,
}
```

对于 `TaskResourceState` 我们只需要 `allocation` 和 `need` ，这方便我们的分配操作，而 `max` 一般只是检查资源的合理性.

全局实例 `BANKER_ALGO` 是对 `pid` 到 `BankerAlogorithm` 的 KV 键值对，用于开启对应 `pid` 的死锁避免算法.

```rust
lazy_static! {
    /// The banker algorithm instance
    pub static ref BANKER_ALGO: UPSafeCell<BTreeMap<TaskIdentifier, BankerAlgorithm>> = unsafe {UPSafeCell::new(BTreeMap::new())};
}
```

考虑我们先前提到的步骤，对 `BankerAlgorithm.available` 的方法就是 `init_available_resource` ，以添加对应资源的数量. 对 `BankerAlgorithm.task_state` 的方法较多一些，`request` 是对 `init_task_resource` 的封装，同时执行 `security_check`. `init_task_resource` 就是试探性地将 `need` 数量增加；`alloc` 直接分配：

```rust
// Available[j] = Available[j] - Request[i,j];
*available -= request;
// Allocation[i,j] = Allocation[i,j] + Request[i,j];
task.allocation += request;
// Need[i,j] = Need[i,j] - Request[i,j];
task.need -= request;
```

`dealloc` 就是反过来执行. `security_check` 开启一个全为 `false` 的数组表示初始时所有线程都没有结束，执行上述所说 1 ~ 4 步进行安全性检查. 我认为这里是检查分配后是否会出现死锁，检查所有线程以保证系统安全.

在具体实现上，`init_available_resource` 添加在 `sys_mutex_create` 和 `sys_semaphore_create` 上. 在 `sys_mutex_lock` 和 `sys_semaphore_down` 中，每次先 `request` 以检测是否是一个合理的资源分配，然后才 `alloc`. `dealloc` 在 `sys_mutex_unlock` 和 `sys_semaphore_up` 中都存在因为这意味着对已占用资源的释放. 

`sys_semaphore_down` 中的 `sem.down()` 必须在 `alloc(tid, sem_id, 1)` 之前，可能是因为 `sem.down()` 会将进程挂起。若 `alloc()` 在此之前，可能导致资源并未被实际获取，由此其他进程因为错误的状态而无法获取资源. 这个顺序保持着资源分配记录与实际获取资源状态相一致.

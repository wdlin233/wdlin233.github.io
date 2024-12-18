---
author: wdlin
pubDatetime: 2024-10-21T20:38:17Z
modDatetime: 2024-12-17T10:57:01Z
title: rCore-1 ch1~3
slug: rCore-1
featured: false
draft: false
tags:
  - Rust
  - rCore
  - OS
description:
  rCore lab notes from chapter 1 to chapter 3.
---

## ch1 基本环境

### 用户态执行环境

我们发现Rust编译器要找的入口函数是 `_start()` ，于是我们可以在 `main.rs` 中添加如下内容.

```rust
// os/src/main.rs
#[no_mangle]
extern "C" fn _start() {
    loop{};
}
```

但是

```shell
$ qemu-riscv64 target/riscv64gc-unknown-none-elf/debug/os
  段错误 (核心已转储)
```

<!--more-->

出错了，这是因为目前的执行环境还缺了一个退出机制。实现如下. 在[第二章](#syscall)会详细讲解.

```rust
// os/src/main.rs
#![feature(llvm_asm)]
const SYSCALL_EXIT: usize = 93;
fn syscall(id: usize, args: [usize; 3]) -> isize {
    let mut ret: isize;
    unsafe {
        llvm_asm!("ecall"
            : "={x10}" (ret)
            : "{x10}" (args[0]), "{x11}" (args[1]), "{x12}" (args[2]), "{x17}" (id)
            : "memory"
            : "volatile"
        );
    }
    ret
}

pub fn sys_exit(xstate: i32) -> isize {
    syscall(SYSCALL_EXIT, [xstate as usize, 0, 0])
}

#[no_mangle]
extern "C" fn _start() {
    sys_exit(9);
}
```

即可使用.

```shell
$ cargo build --target riscv64gc-unknown-none-elf
  Compiling os v0.1.0 (/media/chyyuu/ca8c7ba6-51b7-41fc-8430-e29e31e5328f/thecode/rust/os_kernel_lab/os)
    Finished dev [unoptimized + debuginfo] target(s) in 0.26s

[$?表示执行程序的退出码，它会被告知 OS]
$ qemu-riscv64 target/riscv64gc-unknown-none-elf/debug/os; echo $?
9
```

我们也可通过格式化宏与`sys_write`实现`println!`.

### 裸机启动过程与关机

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

其中`-bios $(BOOTLOADER)` 在硬件内存中的固定位置 `0x80000000` 处放置了一个 BootLoader 程序 RustSBI. `-device loader,file=$(KERNEL_BIN),addr=$(KERNEL_ENTRY_PA)` 这个参数表示硬件内存中的特定位置 `$(KERNEL_ENTRY_PA)` 放置了操作系统的二进制代码 `$(KERNEL_BIN)` , `$(KERNEL_ENTRY_PA)` 的值是 `0x80200000` .

当我们执行包含上次参数的 qemu-system-riscv64 软件，就意味给这台虚拟的 RISC-V64 计算机加电了。此时，CPU的其它通用寄存器清零， 而PC寄存器会指向 `0x1000` 的位置，即 CPU 加电后执行的第一条指令的位置（固化在硬件中的一小段引导代码），它会很快跳转到 `0x80000000` 处， 即 RustSBI 的第一条指令. 

RustSBI 完成基本的硬件初始化后， 会跳转操作系统的二进制代码 `$(KERNEL_BIN)` 所在内存位置 `0x80200000` ，执行操作系统的第一条指令。 这时我们的编写的操作系统才开始正式工作。

其中， `0x80000000` 是QEMU的硬件模拟代码中设定好的 `Bootloader` 的起始地址，`0x80200000` 是 `Bootloader--RustSBI` 的代码中设定好的 `os` 的**起始地址**。

> SBI 是 RISC-V 的一种底层规范，操作系统内核可直接调用SBI提供的底层功能，如关机、显示字符串等。

***

应用程序访问操作系统提供的系统调用的指令是 `ecall` ，操作系统访问 **RustSBI** 提供的SBI服务的SBI调用的指令也是 `ecall` . RustSBI 位于完全掌控机器的机器特权级（Machine Mode），通过 `ecall` 指令，可以完成从弱特权级到强特权级的转换。

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

编译执行.

```shell
# 编译生成ELF格式的执行文件
$ cargo build --release
 Compiling os v0.1.0 (/media/chyyuu/ca8c7ba6-51b7-41fc-8430-e29e31e5328f/thecode/rust/os_kernel_lab/os)
  Finished release [optimized] target(s) in 0.15s
# 把ELF执行文件转成bianary文件
$ rust-objcopy --binary-architecture=riscv64 target/riscv64gc-unknown-none-elf/release/os --strip-all -O binary target/riscv64gc-unknown-none-elf/release/os.bin

# 加载运行
$ qemu-system-riscv64 -machine virt -nographic -bios ../bootloader/rustsbi-qemu.bin -device loader,file=target/riscv64gc-unknown-none-elf/release/os.bin,addr=0x80200000
# 无法退出，风扇狂转，感觉碰到死循环
```

对 `os` ELF执行程序，通过rust-readobj分析，看到的入口地址不是 RustSBI 约定的 `0x80200000` 。我们需要修改 `os` ELF执行程序的内存布局。

### 链接脚本 linker.ld 配置内存布局

我们可以通过 **链接脚本** (Linker Script) 调整链接器的行为，使得最终生成的可执行文件的内存布局符合我们的预期。 我们修改 Cargo 的配置文件来使用我们自己的链接脚本 `os/src/linker.ld` 而非使用默认的内存布局.

```toml
# os/.cargo/config.toml
[build]
target = "riscv64gc-unknown-none-elf"

[target.riscv64gc-unknown-none-elf]
rustflags = [
    "-Clink-arg=-Tsrc/linker.ld", "-Cforce-frame-pointers=yes"
]
```

具体的链接脚本 `os/src/linker.ld` 如下.

```
OUTPUT_ARCH(riscv)
ENTRY(_start)
BASE_ADDRESS = 0x80200000;

SECTIONS
{
    . = BASE_ADDRESS;
    skernel = .;

    stext = .;
    .text : {
        *(.text.entry)
        *(.text .text.*)
    }

    . = ALIGN(4K);
    etext = .;
    srodata = .;
    .rodata : {
        *(.rodata .rodata.*)
    }

    . = ALIGN(4K);
    erodata = .;
    sdata = .;
    .data : {
        *(.data .data.*)
    }

    . = ALIGN(4K);
    edata = .;
    .bss : {
        *(.bss.stack)
        sbss = .;
        *(.bss .bss.*)
    }

    . = ALIGN(4K);
    ebss = .;
    ekernel = .;

    /DISCARD/ : {
        *(.eh_frame)
    }
}
```

第 1 行我们设置了目标平台为 riscv ；第 2 行我们设置了整个程序的入口点为之前定义的全局符号 `_start`； 第 3 行定义了一个常量 `BASE_ADDRESS` 为 `0x80200000`. 在 ch2 中，我们将程序的起始物理地址调整为 `0x80400000` ，三个应用程序都会被加载到这个物理地址上运行.

第 5 行，`.` 表示当前地址，链接器会从它指向的位置开始，往下放置，从输入的目标文件中，收集来的段。我们可以对 `.` 进行赋值来调整接下来的段放在哪里，也可以创建一些全局符号赋值为 `.` 从而记录这一时刻的位置。

第 32 行，段 `.bss.stack` 被放入到可执行文件中的 `.bss` 段中的低地址中。在后面虽然有一个通配符 `.bss.*` ，但是由于链接脚本的优先匹配规则它并不会被匹配到后面去。 即**地址区间 [sbss,ebss) 并不包括栈空间**。

对于

```
.rodata : {
    *(.rodata)
}
```

冒号前面表示最终生成的可执行文件的一个段的名字，花括号内按照放置顺序将所有输入目标文件的哪些段放在这个段中。每一行格式为 `<ObjectFile>(SectionName)`，表示目标文件 `ObjectFile` 的名为 `SectionName` 的段需要被放进去。我们也可以使用通配符。

因此，最终的合并结果是，在最终可执行文件 中各个常见的段 `.text, .rodata .data, .bss` 从低地址到高地址按顺序放置，每个段里面都包括了所有输入目标文件的同名段， 且每个段都有两个全局符号给出了它的开始和结束地址（比如 `.text` 段的开始和结束地址分别是 `stext` 和 `etext` ）.

`ALIGN` 用于实现地址对齐，了解可见 [到底为什么要内存对齐？](https://www.bilibili.com/video/BV1aV4y1y7Sd/)

对链接脚本可以查询[链接脚本(Linker Scripts)语法和规则解析(自官方手册) - BSP-路人甲 - 博客园](https://www.cnblogs.com/jianhua1992/p/16852784.html).

> Q: 如何做到执行环境的初始化代码被放在内存上以 `0x80200000` 开头的区域上？
>
> A: 从`0x80200000`开始，第一个被放置的 是 `.text` ，而里面第一个被放置的又是来自 `entry.asm` 中的段 `.text.entry`，这个段恰恰是含有两条指令的执行环境初始化代码， 它在所有段中最早被放置在我们期望的 `0x80200000` 处.

### 汇编配置栈空间布局

因为我们还没有设置栈空间，所以我们的程序还不足以运行。我们需要有一段代码来分配并栈空间，并把 `sp` 寄存器指向栈空间的起始位置。注意，栈空间是从上向下 `push` 数据的。

<img src="https://www.ruanyifeng.com/blogimg/asset/2018/bg2018012215.png" alt="栈空间" style="zoom:67%;" />

```assembly
# os/src/entry.asm
	.section .text.entry
    .globl _start
_start:
    la sp, boot_stack_top
    call rust_main

    .section .bss.stack
    .globl boot_stack_lower_bound
boot_stack_lower_bound:
    .space 4096 * 16
    .globl boot_stack_top
boot_stack_top:
```

栈空间的栈顶地址被全局符号 `boot_stack_top` 标识，栈底则被全局符号 `boot_stack` 标识.

汇编语言的快速入门可看 [汇编语言入门教程 - 阮一峰的网络日志](https://www.ruanyifeng.com/blog/2018/01/assembly-language-primer.html). 对`.section`和`.text`有[汇编.section和.text以及入口地址解释_section .data-CSDN博客](https://blog.csdn.net/a513247209/article/details/118326530). `la`即为 load address，是一条伪指令 [伪指令及其作用_xdata伪指令的作用-CSDN博客](https://blog.csdn.net/bird67/article/details/1920692).

然后我们可在`main.rs`中嵌入汇编代码.

```rust
// os/src/main.rs
#![no_std]
#![no_main]
#![feature(global_asm)]

mod lang_items;

global_asm!(include_str!("entry.asm"));

#[no_mangle]
pub fn rust_main() -> ! {
    loop {}
}
```

我们手动设置 `global_asm` 特性来支持在 Rust 代码中嵌入全局汇编代码。首先通过 `include_str!` 宏将同目录下的汇编代码 `entry.asm` 转化为字符串并通过 `global_asm!` 宏嵌入到代码中。并且，需要通过宏将 `rust_main` 标记为 `#[no_mangle]` 以避免编译器对它的名字进行混淆，避免 `entry.asm` 找不到 `main.rs` 提供的外部符号 `rust_main` 从而导致链接失败。

### 清空 .bss 段

一般的应用程序的 `.bss` 段，在程序开始运行之前会被执环境（系统库或操作系统内核）固定初始化为零。在 ELF 文件中，为了节省磁盘空间，只会记录 `.bss` 段的位置。且应用程序的假定在它执行前，其 `.bss`段 的数据内容都已全是0.

```rust
// os/src/main.rs
fn clear_bss() {
    extern "C" {
        fn sbss();
        fn ebss();
    }
    (sbss as usize..ebss as usize).for_each(|a| {
        unsafe { (a as *mut u8).write_volatile(0) }
    });
}
```

在程序内自己进行清零的时候，我们就不用去解析 ELF，而是通过链接脚本 `linker.ld` 中给出的全局符号 `sbss` 和 `ebss` 来确定 `.bss` 段的位置.

### 裸机打印实现

```rust
const SBI_CONSOLE_PUTCHAR: usize = 1;

pub fn console_putchar(c: usize) {
    syscall(SBI_CONSOLE_PUTCHAR, [c, 0, 0]);
}

impl Write for Stdout {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        //sys_write(STDOUT, s.as_bytes());
        for c in s.chars() {
            console_putchar(c as usize);
        }
        Ok(())
    }
}
```

把操作系统调用改为SBI调用 `syscall(SBI_CONSOLE_PUTCHAR, ...)`.

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

> 在大多数只与通用寄存器打交道的指令中， rs 表示 **源寄存器** (Source Register)， imm 表示 **立即数** (Immediate)， 是一个常数，二者构成了指令的输入部分；而 rd 表示 **目标寄存器** (Destination Register)，它是指令的输出部分。rs 和 rd 可以在 32 个通用寄存器 x0~x31 中选取。

这两条指令除了设置 pc 寄存器完成跳转功能之外，还将当前跳转指令的下一条指令地址保存在 `rd` 寄存器中。在 RISC-V 架构中， 通常使用 **`ra` 寄存器**（即 `x1` 寄存器）作为其中的 `rd` ，因此在函数返回的时候，只需跳转回 `ra` 所保存的地址即可。

函数返回时，我们常使用一条 **伪指令** (Pseudo Instruction) 跳转回调用之前的位置: `ret` . 它会被汇编器翻译为 

```assembly
jalr x0, 0(x1)
```

含义为**跳转到寄存器 `ra` （即 `x1`）保存的物理地址**，由于 **`x0` 是一个恒为 0 的寄存器**，任何写入到 `x0` 的值都会被直接丢弃，在 `rd` 中，保存这一步被省略，即**不需要保存返回地址**。

进行函数调用的时候，我们通过 `jalr` 指令 保存返回地址并实现跳转；而在函数即将返回的时候，则通过 `ret` 指令跳转之前的下一条指令继续执行。这**两条指令**实现了函数调用流程的核心机制。

#### 函数调用上下文与调用规范

编译器除了函数调用的相关指令之外，基本不使用 `ra` 寄存器。意即，如果在函数中没有调用其他函数，那 ra 的值不会变化，函数调用流程能正常工作。但是，实际编写代码时，我们常常会遇到函数**多层嵌套调用**的情形。

因此我们需要保证，在一个函数调用子函数的前后，包括 `ra` 寄存器在内的所有通用寄存器的值都不能发生变化。 我们将由于函数调用，在控制流转移前后需要保持不变的**寄存器集合**称之为**函数调用上下文**(Context) 或称**活动记录** (Activation Record).

在调用子函数之前，我们需要在 内存中的一个区域保存(Save)函数调用上下文中的寄存器；而之后我们会从内存中同样的区域读取并恢复(Restore)函数调用上下文中的寄存器。

函数调用上下文中的寄存器被分为如下[两类](https://blog.csdn.net/Edidaughter/article/details/122334074)：

- **被调用者保存** (Callee-Saved) 寄存器，即被调用的函数保证调用它前后，这些寄存器保持不变；
- **调用者保存** (Caller-Saved) 寄存器，被调用的函数可能会覆盖这些寄存器。

寄存器可见于[RISC-V 架构的 C 语言调用规范](https://riscv.org/wp-content/uploads/2015/01/riscv-calling.pdf)或[Cornell](http://www.cs.cornell.edu/courses/cs3410/2019sp/schedule/slides/10-calling-notes-bw.pdf).

函数调用上下文由调用者和被调用者分别保存，其具体过程分别如下：

- 调用者：首先保存不希望在函数调用过程中发生变化的调用者保存寄存器，然后通过 jal/jalr 指令调用子函数，返回回来之后恢复这些寄存器。
- 被调用者：在函数开头保存函数执行过程中被用到的被调用者保存寄存器，然后执行函数，在退出之前恢复这些寄存器。

无论是调用者还是被调用者，都会因调用行为而需要两段匹配的保存和恢复寄存器的汇编代码，可以分别将其称为 **开场白** (Prologue) 和 **收场白** (Epilogue)，它们会由编译器帮我们自动插入。

#### 栈指针与栈帧

函数调用上下文的保存/恢复的寄存器保存在栈(Stack)中 . ` sp`(即`x2`寄存器) 用来保存**栈指针** (Stack Pointer)，它是一个指向了内存中**已经用过的位置**的一个地址。

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

### 特权级机制

####  执行环境

为确保操作系统的安全，需要限制应用程序的两个方面： 

- 应用程序不能访问任意的地址空间（ch4）
- 应用程序不能执行某些可能破环计算机系统的指令（本章 ch2）

处理器设置两个不同安全等级的执行环境，用户态特权级和内核态特权级。指出可能破会计算机系统的内核态特权级的指令子集，规定其只能在内核态特权级的执行环境中执行，如果在用户态特权级的环境执行这些指令，会产生异常。

为了让应用程序获得操作系统的函数服务，采用传统的函数调用方式（即通常的 `call` 和 `ret` 指令或指令组合）将会直接绕过硬件的特权级保护检查。所以要设计新的指令：**执行环境调用**(Execution Environment Call，简称 `ecall` )和**执行环境返回**(Execution Environment Return，简称 `eret` )：

- `ecall` ：具有**用户态到内核态**的执行环境切换能力的，函数调用指令（RISC-V中就有这条指令）
- `eret` ：具有内核态到用户态的执行环境切换能力的，函数返回指令（RISC-V中有类似的 `sret` 指令）

操作系统需要提供相应的控制流，能在执行 `eret` 前，**恢复用户态**执行应用程序的上下文。其次，在应用程序调用 `ecall` 指令后，能够**保存用户态**应用程序的上下文。

***

RISC-V存在四种特权级：

| 级别 | 编码 | 名称                |
| ---- | ---- | ------------------- |
| 0    | 00   | U, User/Application |
| 1    | 01   | S, Supervisor       |
| 2    | 10   | H, Hypervisor       |
| 3    | 11   | M, Machine          |

这张图片给出了能够支持运行 Unix 这类复杂系统的软件栈。

<a id="systemArch"></a>

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/PrivilegeStack.png" alt="RISC-V特权级" style="zoom:67%;" />

白色块表示一层执行环境，黑色块表示相邻两层执行环境之间的接口。内核代码运行在 S 模式上；应用程序运行在 U 模式上。运行在 M 模式上的软件被称为 **监督模式执行环境** (SEE, Supervisor Execution Environment) ，从运行在 S 模式上的软件的视角来看，它的下面也需要一层执行环境支撑，因此被命名为 SEE，它需要在相比 S 模式更高的特权级下运行， 一般情况下在 M 模式上运行。

执行环境的其中一种功能是，在执行它支持的上层软件之前，进行一些初始化工作。我们之前提到的，引导加载程序会在加电后对整个系统进行初始化，它实际上是 SEE 功能的一部分，也就是说在 RISC-V 架构上引导加载程序一般运行在 M 模式上。

**ch1 中的操作系统和应用程序全程运行在 S 模式下**，应用程序很容易破坏没有任何保护的执行环境–操作系统。

后续的章节中，应用程序和用户态支持库运行在 U 模式的最低特权级；操作系统内核运行在 S 模式特权级（ch2中 批处理系统），形成支撑应用程序和用户态支持库的执行环境；而第一章提到的预编译的 bootloader – `RustSBI` 实际上是运行在更底层的 M 模式特权级下的软件，是操作系统内核的执行环境。整个软件系统就由这三层运行在不同特权级下的不同软件组成。

#### 异常

执行环境的另一种功能，是对上层软件的执行进行监控管理。

当上层软件执行的时，需要用到执行环境中提供的功能， 需要暂停，转而运行执行环境的代码。由于上层软件和执行环境被设计为运行在不同的特权级，这个过程也往往（而 **不一定** ） 伴随着 CPU 的 **特权级切换** 。当执行环境的代码运行结束后，我们需要回到上层软件暂停的位置继续执行。

用户态应用触发从**用户态到内核态**的 **异常控制流** 的原因总体上可以分为两种：

- 执行 Trap 类异常指令
- 执行 Fault 类异常的指令 

Trap 类异常指令即用户态软件为获得内核态操作系统的<u>服务功能</u>，而发出的特殊指令. Fault类的指令为用户态软件执行了在内核态操作系统看来是<u>非法操作</u>的指令. 更多可见[异常一览表](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter2/1rv-privilege.html#id6).

在 RISC-V 架构中，这种与常规控制流 （顺序、循环、分支、函数调用）不同的 **异常控制流** (ECF, Exception Control Flow) 被称为 **异常（Exception）** 。

[执行环境](#systemArch) 中相邻两特权级软件之间的接口正是基于`ecall`的陷入机制实现的。M 模式软件 SEE 和 S 模式的内核之间的接口被称为 监督模式二进制接口 (Supervisor Binary Interface, **SBI**)，而内核和 U 模式的应用程序之间的接口被称为 应用程序二进制接口 (Application Binary Interface, **ABI**). 特权级切换如图.

<a id="privilege level"></a>

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/EnvironmentCallFlow.png" alt="三态特权级切换" style="zoom:67%;" />

***

与特权级无关的一般的指令和**通用寄存器** `x0~x31` 在任何特权级都可以任意执行。而每个特权级都对应一些特殊指令和**控制状态寄存器** (**CSR**, Control and Status Register) ，来控制该特权级的某些行为并描述其状态。当然特权指令不只是具有有读写 CSR 的指令，还有其他功能的特权指令。

RISC-V 中的 S 模式特权指令：

| 指令               | 含义                                                         |
| ------------------ | ------------------------------------------------------------ |
| sret               | 从S模式返回U模式。在U模式下执行会产生非法指令异常            |
| wfi                | 处理器在空闲时进入低功耗状态等待中断。在U模式下执行会尝试非法指令异常 |
| sfence.vma         | 刷新TLB缓存。在U模式下执行会尝试非法指令异常                 |
| 访问S模式CSR的指令 | 通过访问 [sepc/stvec/scause/sscartch/stval/sstatus/satp等CSR](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter2/4trap-handling.html#term-s-mod-csr) 来改变系统状态。在U模式下执行会尝试非法指令异常 |

### 应用程序构建

#### 项目结构

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

在`lib.rs`中定义一个`main`函数，其具有弱链接特性。在编译过程中，弱符号遇到强符号时，会选择强符号而丢掉弱符号。参考[嵌入式C语言自我修养 09：链接过程中的强符号和弱符号 - 知乎](https://zhuanlan.zhihu.com/p/55768978).

故rCore文档中说：

> 我们使用 Rust 宏将其标志为弱链接。这样在最后链接的时候， 虽然 `lib.rs` 和 `bin` 目录下的某个应用程序中都有 `main` 符号， 但由于 `lib.rs` 中的 `main` 符号是弱链接， 链接器会使用 `bin` 目录下的函数作为 `main` 。 如果在 `bin` 目录下找不到任何 `main` ，那么编译也能通过，但会在运行时报错。

#### 系统调用

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

### 批处理系统实现

#### 应用程序链接至内核

我们需要将应用程序链接到内核，即将应用程序的二进制镜像文件作为内核的数据段链接到内核内，因此内核需要知道内含的应用程序的数量和它们的位置，实现运行时的管理并能够加载到物理内存。

```rust
// os/src/main.rs
core::arch::global_asm!(include_str!("entry.asm"));
core::arch::global_asm!(include_str!("link_app.S"));
```

<a id="batch"></a>

汇编代码 `link_app.S` 一开始并不存在，而是在`make run`构建的时候自动生成的.

```assembly
# os/src/link_app.S

    .align 3
    .section .data
    .global _num_app
_num_app:
    .quad 3
    .quad app_0_start
    .quad app_1_start
    .quad app_2_start
    .quad app_2_end

    .section .data
    .global app_0_start
    .global app_0_end
app_0_start:
    .incbin "../user/target/riscv64gc-unknown-none-elf/release/00hello_world.bin"
app_0_end:

    .section .data
    .global app_1_start
    .global app_1_end
app_1_start:
    .incbin "../user/target/riscv64gc-unknown-none-elf/release/01store_fault.bin"
app_1_end:

    .section .data
    .global app_2_start
    .global app_2_end
app_2_start:
    .incbin "../user/target/riscv64gc-unknown-none-elf/release/02power.bin"
app_2_end:
```

在`.section`指定接下来的数据属于`.data`（数据段）后，`.global`声明符号为全局符号，使其在其他文件中可见。

`.align`用于指定数据的对齐，`.align 3` 将接下来的数据对齐到 2 ^ 3 = 8 字节的边界，因为`_num_app` 和随后的 `app_0_start`、`app_1_start`、`app_2_start` 等符号是以 `quad` 进行定义的，`.quad`分配并初始化一个 64-bit（8字节）数据。在 64 位系统中实现内存对齐到 8 字节边界。 

`.incbin`包含一个外部二进制文件的内容，并将其嵌入到当前字节流中。这在需要将预编译的二进制文件直接打包到程序中的情况下非常有用。

其中`_num_app`段相当于一个64位整数数组，第一个元素表示应用程序数量，之后是各个应用的起始地址，最后是最后一个程序的结束位置，这样应用程序的位置都能从该数组中相邻两个元素中得知。

> Q：`.data`段是连续的吗？
>
> A：每个应用程序的数据部分没有显式地分配新的段（即没有使用 `.section` 和 `.text` 之间的切换），故它们的内存分布是 **连续的**。事实上，多个 `.section .data` 和 `.global` 指令只是在一个单一的数据段内逐个声明不同的符号，因此它们共享同一个数据段，它们之间的数据是 **按顺序排列** 的。

#### Rust应用加载与AppManager

由此我们可以在Rust中实现应用加载.

```rust
struct AppManager {
    num_app: usize,
    current_app: usize,
    app_start: [usize; MAX_APP_NUM + 1],
}
```

初始化 `AppManager` 的全局实例.

```rust
lazy_static! {
    static ref APP_MANAGER: UPSafeCell<AppManager> = unsafe {
        UPSafeCell::new({
            extern "C" {
                fn _num_app();
            }
            let num_app_ptr = _num_app as usize as *const usize;
            let num_app = num_app_ptr.read_volatile();
            let mut app_start: [usize; MAX_APP_NUM + 1] = [0; MAX_APP_NUM + 1];
            let app_start_raw: &[usize] =
                core::slice::from_raw_parts(num_app_ptr.add(1), num_app + 1);
            app_start[..=num_app].copy_from_slice(app_start_raw);
            AppManager {
                num_app,
                current_app: 0,
                app_start,
            }
        })
    };
}
```

在初始化`AppManager`的代码中，`UPSafeCell`获取内部对象的可变引用，拥有**内部可变性**。在 rCore-v3 中，这通过`RefCell<AppManagerInner>`而实现，`APP_MANAGER: AppManager = AppManager{...}`.

对于有些全局变量，其初始化依赖于运行期间才能得到的数据。 此处声明了一个 `AppManager` 结构的名为 `APP_MANAGER` 的全局实例， 只有在它第一次被使用到的时候才会进行实际的初始化工作。

初始化的逻辑很简单，就是找到 `link_app.S` 中提供的符号 `_num_app` ，并从这里开始解析出应用数量以及各个应用的开头地址。对 `app_start[..=num_app]`一句，`..=num_app` 是一个**范围表达式**，表示索引从 `0` 到 `num_app`（包含 `num_app`）.

> Q：何为内部可变性？
>
> A：内部可变性实现的是，多个可变引用，即持有共享引用的同时还可改变数据。参考[Cell, RefCell, and Interior Mutability in Rust | BadBoi.dev](https://badboi.dev/rust/2020/07/17/cell-refcell.html), [内部可变性/Interior Mutability in Rust - 知乎](https://zhuanlan.zhihu.com/p/380419980).
>
> rCore-v3 解释说：所谓的内部可变性，即指在我们只能拿到 `AppManager` 的**不可变借用**，意味着同样也只能 拿到 `AppManagerInner` 的不可变借用的情况下**依然可以**修改 `AppManagerInner` 里面的字段。 使用 `RefCell::borrow/RefCell::borrow_mut` 分别可以拿到 `RefCell` 里面内容的不可变借用/可变借用， `RefCell` 会在运行时维护当前它管理的对象的已有借用状态，并在访问对象时进行借用检查。于是 `RefCell::borrow_mut` 就是我们实现内部可变性的关键。
>
> rCore-v4 解释说：用容器 `UPSafeCell` 包裹 `AppManager` 是为了防止全局对象 `APP_MANAGER` 被重复获取。`UPSafeCell` 实现在 `sync` 模块中，调用 `exclusive_access` 方法能获取其**内部对象的可变引用**， 如果程序运行中同时存在多个这样的引用，会触发 `already borrowed: BorrowMutError`，`UPSafeCell` 既提供了内部可变性，又在单核情境下防止了内部对象被重复借用，我们将在后文中多次见到它。

> Q：为什么需要`copy_from_slice`?
>
> A：因为`from_raw_parts`获得的切片只是对某一段数据的引用，它并不拥有数据，也不负责管理数据的内存。如果只是创建了切片并希望直接操作目标数组，这在 Rust 中是不允许的，因为切片并不拥有数据，只是一个*视图*。

这里我们使用了外部库 `lazy_static` 提供的 `lazy_static!` 宏。要引入这个外部库，我们需要加入依赖：

```toml
# os/Cargo.toml
[dependencies]
lazy_static = { version = "1.4.0", features = ["spin_no_std"] }
```

> 一般情况下，全局变量必须在编译期设置一个初始值，但是有些全局变量依赖于运行期间才能得到的数据作为初始值。这导致这些全局变量需要在运行时发生变化，也即重新设置初始值之后才能使用。
>
>  `lazy_static!` 宏提供了全局变量的运行时初始化功能。借助 Rust 核心库提供的 `RefCell` 和外部库 `lazy_static!`，我们就能在避免 `static mut` 声明的情况下以更加优雅的Rust风格使用全局变量。

在`AppManager`方法中，

```rust
unsafe fn load_app(&self, app_id: usize) {
    if app_id >= self.num_app {
        panic!("All applications completed!");
    }
    info!("[kernel] Loading app_{}", app_id); // v3: println!("[kernel] Loading app_{}", app_id);
    // clear icache
    core::arch::asm!("fence.i"); // v3: llvm_asm!("fence.i" :::: "volatile");
    // clear app area
    core::slice::from_raw_parts_mut(APP_BASE_ADDRESS as *mut u8, APP_SIZE_LIMIT).fill(0);
    let app_src = core::slice::from_raw_parts(
        self.app_start[app_id] as *const u8,
        self.app_start[app_id + 1] - self.app_start[app_id],
    );
    let app_dst = core::slice::from_raw_parts_mut(APP_BASE_ADDRESS as *mut u8, app_src.len());
    app_dst.copy_from_slice(app_src);
}
```

这个方法负责将参数 `app_id` 对应的应用程序的二进制镜像加载到物理内存以 `0x80400000` 开头的位置，即批处理操作系统和应用程序之间，约定的常数地址。

回忆[先前](#batch)，我们也调整应用程序的内存布局以同一个地址开头。此处，`.fill(0)`将一块内存清空，然后`app_src`找到待加载应用二进制镜像的位置，`app_dst`将它复制到正确的位置。它本质上是把数据从一块内存复制到另一块内存。

> `core::slice::from_raw_parts`方法究竟是什么？
>
> `pub const unsafe fn from_raw_parts<'a, T>(data: *const T, len: usize) -> &'a [T]`.
>
> Explanation: Forms a slice from a **pointer** and a length. The `len` argument is the number of **elements**, not the number of bytes.
>
> ```rust
> let x = 42;
> let ptr = &x as *const _;
> let slice = unsafe { slice::from_raw_parts(ptr, 1) };
> assert_eq!(slice[0], 42);
> ```

注意我们插入了一条汇编指令 `fence.i` ，它是用来清理 i-cache 的。

缓存是存储层级结构中，提高访存速度的很重要一环。 而 CPU 对物理内存所做的缓存又分成 **数据缓存** (d-cache) 和 **指令缓存** (i-cache) 两部分，分别在 CPU **访存**和**取指**的时候使用。取指时，对于一个指令地址， CPU 会先去 i-cache 里面查看它是否在某个已缓存的缓存行内，如果在，它就会直接从高速缓存中拿到指令，而不是通过总线和内存通信。

通常情况下， CPU 会认为程序的代码段不会发生变化，因此 i-cache 是一种**只读缓存**。但在这里，我们会修改会被 CPU 取指的内存区域，这会使得 i-cache 中含有与内存中不一致的内容。因此我们这里必须使用 `fence.i` 指令手动清空 i-cache ，让里面所有的内容全部失效， 才能够保证正确性。

> 此处待补充，需要更清晰的理解。另外，在OSCamp的rCore-v3文档中，没用`fence.i`的相关内容。

`batch` 子模块对外暴露出两个接口，`init` 和`run_next_app`.

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

涉及特权级切换的应用程序的调用情况[如图所示](#privilege level). 应用程序的上下文可以分为通用寄存器和栈**两部分**。通用寄存器部分先前提及过；而对于栈，需要两个执行流，并且其记录的**执行历史**的栈所对应的内存区域不相交，就不会产生覆盖问题，无需进行保存/恢复。

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

接着，是Trap上下文 `TrapContext` ，即在 Trap 发生时需要保存的物理资源内容，并将其一起放在一个名为 `TrapContext` 的类型中，定义如下：

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

##### __alltraps

我们在 `os/src/trap/trap.S` 中实现 Trap 上下文保存/恢复的汇编代码，分别用外部符号 `__alltraps` 和 `__restore` 标记，并将这段汇编代码中插入进来。

```assembly
# os/src/trap/trap.S
.macro SAVE_GP n
    sd x\n, \n*8(sp)
.endm

.align 2
__alltraps:
    csrrw sp, sscratch, sp
    # now sp->kernel stack, sscratch->user stack
    # allocate a TrapContext on kernel stack
    addi sp, sp, -34*8
    # save general-purpose registers
    sd x1, 1*8(sp)
    # skip sp(x2), we will save it later
    sd x3, 3*8(sp)
    # skip tp(x4), application does not use it
    # save x5~x31
    .set n, 5
    .rept 27
        SAVE_GP %n
        .set n, n+1
    .endr
    # we can use t0/t1/t2 freely, because they were saved on kernel stack
    csrr t0, sstatus
    csrr t1, sepc
    sd t0, 32*8(sp)
    sd t1, 33*8(sp)
    # read user stack from sscratch and save it on the kernel stack
    csrr t2, sscratch
    sd t2, 2*8(sp)
    # set input argument of trap_handler(cx: &mut TrapContext)
    mv a0, sp
    call trap_handler
```

以下对该汇编代码进行解释：

<a id="assembly"></a>

`csrrw rd, csr, rs1`，作用是将来自寄存器 `rs1` 的值写入控制和状态寄存器（CSR），并将CSR的旧值读入寄存器 `rd`.  因此这里起到的是**交换**` sscratch` 和` sp` 的效果。在这一行之前 `sp` 指向用户栈， `sscratch` 指向内核栈，现在 `sp` 指向内核栈， `sscratch` 指向用户栈。

`addi sp, sp, -34*8`用于预先分配栈帧（内核栈），将`sp`的值与`-34*8`相加后存入`sp`. **准备在内核栈上保存 Trap 上下文.**

`sd rs2, offset(rs1)`，**保存 Trap 上下文的通用寄存器 x0~x31**. Store Doubleword. 将 `rs2` 中的数据存储到地址 `rs1 + offset` 指向的内存位置.  此处按照 `TrapContext` 结构体的内存布局，基于内核栈的位置（sp所指地址）来从低地址到高地址分别按顺序放置 x0~x31 这些通用寄存器.

最后是 `sstatus` 和 `sepc` .  通用寄存器 xn 应该被保存在地址区间 `[sp+8n,sp+8(n+1))` . 

`mv a0, sp` 让寄存器 a0 指向内核栈的栈指针，即保存的 Trap 上下文的地址， 因为随后要调用 `trap_handler` 进行 Trap 处理。第一个参数 `cx` 由调用规范，从 a0 中获取。Trap 处理函数 `trap_handler` 需要 Trap 上下文，因为寄存器的值可能被修改。

***

##### __restore

当 `trap_handler` 返回之后会从调用 `trap_handler` 的下一条指令开始执行，也就是从栈上的 Trap 上下文恢复的 `__restore` ：

```assembly
.macro LOAD_GP n
    ld x\n, \n*8(sp)
.endm

__restore:
    # case1: start running app by __restore
    # case2: back to U after handling trap
    mv sp, a0
    # now sp->kernel stack(after allocated), sscratch->user stack
    # restore sstatus/sepc
    ld t0, 32*8(sp)
    ld t1, 33*8(sp)
    ld t2, 2*8(sp)
    csrw sstatus, t0
    csrw sepc, t1
    csrw sscratch, t2
    # restore general-purpuse registers except sp/tp
    ld x1, 1*8(sp)
    ld x3, 3*8(sp)
    .set n, 5
    .rept 27
        LOAD_GP %n
        .set n, n+1
    .endr
    # release TrapContext on kernel stack
    addi sp, sp, 34*8
    # now sp->kernel stack, sscratch->user stack
    csrrw sp, sscratch, sp
    sret
```

`__alltraps`和`__restore`作为对应操作，其思路完全相反。在应用程序执行流状态被还原之后，使用 `sret` 指令回到 U 特权级，继续运行应用程序执行流

Trap 处理的总体流程如下：首先通过 `__alltraps` **将 Trap 上下文保存在内核栈上**，然后跳转到使用 Rust 编写的 `trap_handler` 函数 完成 Trap 分发及处理。当 `trap_handler` 返回之后，使用 `__restore` 从保存在内核栈上的 Trap 上下文**恢复寄存器**。最后通过一条 `sret` 指令回到应用程序执行。

##### trap_hander

```rust
// os/src/trap/mod.rs
#[no_mangle]
pub fn trap_handler(cx: &mut TrapContext) -> &mut TrapContext {
    let scause = scause::read();
    let stval = stval::read();
    match scause.cause() {
        Trap::Exception(Exception::UserEnvCall) => {
            cx.sepc += 4;
            cx.x[10] = syscall(cx.x[17], [cx.x[10], cx.x[11], cx.x[12]]) as usize;
        }
        Trap::Exception(Exception::StoreFault) |
        Trap::Exception(Exception::StorePageFault) => {
            println!("[kernel] PageFault in application, core dumped.");
            run_next_app();
        }
        Trap::Exception(Exception::IllegalInstruction) => {
            println!("[kernel] IllegalInstruction in application, core dumped.");
            run_next_app();
        }
        _ => {
            panic!("Unsupported trap {:?}, stval = {:#x}!", scause.cause(), stval);
        }
    }
    cx
}
```

返回值为 `&mut TrapContext` 将传入的 `cx` 原样返回，因此在 `__restore` 的时候， a0 在调用 `trap_handler` 前后并没有发生变化，仍然指向分配 Trap 上下文之后的内核栈栈顶。

我们可根据 `scause` 寄存器所保存的 Trap 的原因进行分发处理。需要引入 RISC-V 库.

```toml
# os/Cargo.toml
[dependencies]
riscv = { git = "https://github.com/rcore-os/riscv", features = ["inline-asm"] }
```

`sepc`[寄存器](#TrapCSR)存储的是 Trap 回来之后默认会执行的下一条指令的地址，我们此处让它**增加 `ecall` 指令的码长**，也即 4 字节。这样在 `__restore` 的时候 sepc 在恢复之后就会指向 `ecall` 的下一条指令，并在 `sret` 之后从那里开始执行。

用来保存系统调用**返回值**的 a0 寄存器也会同样发生变化。我们从 Trap 上下文取出作为 [syscall ID 的 a7](#a7) 和系统调用的三个参数 a0~a2 传给 `syscall` 函数并获取返回值。

我们还处理应用程序出现访存错误和非法指令错误的情形。此时需要打印错误信息，并调用 `run_next_app` 直接运行下一个应用程序。

#### 系统调用 syscall

`syscall` 函数并不会实际处理系统调用，只是会根据 syscall ID 分发到具体的处理函数.

```rust
// os/src/syscall/mod.rs
pub fn syscall(syscall_id: usize, args: [usize; 3]) -> isize {
    match syscall_id {
        SYSCALL_WRITE => sys_write(args[0], args[1] as *const u8, args[2]),
        SYSCALL_EXIT => sys_exit(args[0] as i32),
        _ => panic!("Unsupported syscall_id: {}", syscall_id),
    }
}
```

#### 执行应用程序

在运行应用程序之前要完成如下这些工作：

- 跳转到应用程序入口点 `0x80400000`。
- 将使用的栈切换到用户栈。
- 在 `__alltraps` 时我们要求 `sscratch` 指向内核栈，这个也需要在此时完成。
- 从 S 特权级切换到 U 特权级。

它们可以通过**复用** `__restore` 的代码更容易的实现。在内核栈上压入一个相应构造的 Trap 上下文，再 `__restore` ，就能让这些寄存器到达我们希望的状态。

```rust
// os/src/trap/context.rs
impl TrapContext {
    pub fn set_sp(&mut self, sp: usize) { self.x[2] = sp; }
    pub fn app_init_context(entry: usize, sp: usize) -> Self {
        let mut sstatus = sstatus::read();
        sstatus.set_spp(SPP::User);
        let mut cx = Self {
            x: [0; 32],
            sstatus,
            sepc: entry,
        };
        cx.set_sp(sp);
        cx
    }
}
```

由此实现.

```rust
// os/src/batch.rs
pub fn run_next_app() -> ! {
    let mut app_manager = APP_MANAGER.exclusive_access();
    let current_app = app_manager.get_current_app();
    unsafe {
        app_manager.load_app(current_app);
    }
    app_manager.move_to_next_app();
    drop(app_manager);
    // before this we have to drop local variables related to resources manually
    // and release the resources
    extern "C" {
        fn __restore(cx_addr: usize);
    }
    unsafe {
        __restore(KERNEL_STACK.push_context(TrapContext::app_init_context(
            APP_BASE_ADDRESS,
            USER_STACK.get_sp(),
        )) as *const _ as usize);
    }
    panic!("Unreachable in batch::run_current_app!");
}
```

## ch3 多道程序与分时多任务

先趁此复习一下ch2的内容：如果应用越过了硬件所设置特权级界限或主动申请获得操作系统的服务，就会触发 Trap 并进入到批处理系统中进行处理。可以看到，**在内存中同一时间最多只需驻留一个应用**。这是因为只有当一个应用出错或退出之后，批处理系统才会去将另一个应用加载到相同的一块内存区域。

对于多道程序的处理，发展出两种方式：

- **放弃处理器**的操作算是一种对处理器资源的直接管理，所以应用程序可以发出这样的系统调用，让操作系统来具体完成。这样的操作系统就是支持 **多道程序** 协作式操作系统
- 把一个程序在一个时间片上占用处理器执行的过程称为一个 **任务** (Task)，让操作系统对不同程序的**任务**进行管理。通过平衡各个程序在整个时间段上的任务数，使一个包含多个时间片的时间段上，会有属于不同程序的多个任务在轮流占用处理器执行，这样的操作系统就是支持 **分时多任务** 的抢占式操作系统。

在第二章中，应用的加载和进度控制都交给 `batch` 子模块。在第三章，应用的加载功能分离于 `loader` 子模块中，应用的执行和切换交给 `task` 子模块。

> 此处我将减少以往事无巨细的说明，更多是对重点进行总结。

### 多道程序放置与加载

每个应用被加载到的位置都不同，导致它们的链接脚本 `linker.ld` 中的 `BASE_ADDRESS` 都是不同的。可以用脚本 `build.py` 而不是直接用 `cargo build` 构建应用的链接脚本。

```python
# ci-user/user/build.py
import os

base_address = 0x80400000
step = 0x20000
linker = "src/linker.ld"

app_id = 0
apps = os.listdir("build/app")
apps.sort()
chapter = os.getenv("CHAPTER")
mode = os.getenv("MODE", default = "release")
if mode == "release" :
	mode_arg = "--release"
else :
    mode_arg = ""

for app in apps:
    app = app[: app.find(".")]
    os.system(
        "cargo rustc --bin %s %s -- -Clink-args=-Ttext=%x"
        % (app, mode_arg, base_address + step * app_id)
    )
    print(
        "[build.py] application %s start with address %s"
        % (app, hex(base_address + step * app_id))
    )
    if chapter == '3':
        app_id = app_id + 1
```

**所有的应用**，在内核初始化的时候就一并被加载到内存中。为了避免覆盖，它们需要被加载到不同的物理地址。调用 `loader` 子模块的 `load_apps` 实现。

```rust
// os/src/loader.rs
/// Load nth user app at
/// [APP_BASE_ADDRESS + n * APP_SIZE_LIMIT, APP_BASE_ADDRESS + (n+1) * APP_SIZE_LIMIT).
pub fn load_apps() {
    extern "C" {
        fn _num_app();
    }
    let num_app_ptr = _num_app as usize as *const usize;
    let num_app = get_num_app();
    let app_start = unsafe { core::slice::from_raw_parts(num_app_ptr.add(1), num_app + 1) };
    // clear i-cache first
    unsafe {
        asm!("fence.i");
    }
    // load apps
    for i in 0..num_app {
        let base_i = get_base_i(i);
        // clear region
        (base_i..base_i + APP_SIZE_LIMIT)
            .for_each(|addr| unsafe { (addr as *mut u8).write_volatile(0) });
        // load app from data section to memory
        let src = unsafe {
            core::slice::from_raw_parts(app_start[i] as *const u8, app_start[i + 1] - app_start[i])
        };
        let dst = unsafe { core::slice::from_raw_parts_mut(base_i as *mut u8, src.len()) };
        dst.copy_from_slice(src);
    }
}
```

在`load_apps()`中，第 `i`个应用被加载到以物理地址 `base_i` 开头的一段物理内存上，先清空`base_i`段的值，之后将`app_start[i]`的内容复制其上.

`config` 子模块用来存放内核中所有的常数。看到 `APP_BASE_ADDRESS` 被设置为 `0x80400000` ，而 `APP_SIZE_LIMIT` 和上一章一样被设置为 `0x20000` ，也就是每个应用二进制镜像的大小限制。

某个应用程序运行结束或出错时，调用 run_next_app 切换到下一个应用程序。特权级由 S 切换至 U. 与上章的 [执行应用程序](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter2/4trap-handling.html#ch2-app-execution) 一节描述类似，相对不同的是，操作系统需要设置应用程序返回的不同 Trap 上下文。

### 任务切换 __switch

我们将实现**任务切换**，任务切换支持的场景是：一个应用在运行途中便会**主动**交出 CPU 的使用权，此时它只能暂停执行，等到内核重新给它分配处理器资源之后才能恢复并继续执行。

我们就把应用程序的一个计算阶段的执行过程（执行流）称为一个 **任务** ，所有的任务都完成后，应用程序也就完成了。从一个程序的任务切换到另外一个程序的任务称为 **任务切换** 。为了确保切换后的任务能够正确继续执行，操作系统需要支持让任务的执行“暂停”和“继续”。

一条执行流需要支持“暂停-继续”，必然需要一种执行流切换的机制，而且需要保证执行流状态切换前后，即执行过程中同步变化的资源（如寄存器、栈等）需要**保持不变**，或者变化在它的预期之内。并非所有的资源都需要被保存，只有执行过程中仍然有用，且有被覆盖的危险的资源才需要。这些物理资源被称为 **任务上下文 (Task Context)** .

任务切换的执行过程，是第二章的 Trap 之后的另一种异常控制流，都是描述两条执行流之间的切换，但会有如下异同：

- 与 Trap 切换不同，它不涉及特权级切换；
- 与 Trap 切换不同，它的一部分是由编译器帮忙完成的；
- 与 Trap 切换相同，它对应用是透明的。

事实上，它是来自两个不同应用的 Trap 执行流之间的切换。调用 `__switch` 之后直到它返回前的这段时间，原 Trap 执行流会先被暂停并被切换出去， CPU 转而运行另一个应用的 Trap 执行流。之后，原 Trap 执行流会从某一条 Trap 执行流（很可能不是之前切换到的那一条）切换回来继续执行，并最终返回。从实现的角度， `__switch` 和一个普通的函数之间的差别仅仅是它会换栈。

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/task_context.png" alt="Trap Hander1" style="zoom:67%;" />

`__switch`在内核栈上的整体流程为：

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/switch-1.png" style="zoom:67%;" />

阶段 [2]中，A 在自身的内核栈上，分配一块任务上下文的空间，在里面保存 CPU 当前的寄存器快照。

阶段 [3]中，读取 B 的 `task_cx_ptr` 或者说 `task_cx_ptr2` 指向的那块内存，获取到 B 的内核栈栈顶位置，并复制给 `sp` 寄存器来换到 B 的内核栈。**换栈也就实现了执行流的切换** 。

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/switch-2.png" style="zoom:67%;" />

结果上，A 执行流 和 B 执行流的状态发生了互换， A 在保存任务上下文之后进入**暂停**状态，而 B 则**恢复**了**上下文**并在 CPU 上执行。

> Q: 每个任务都具有独立的内核栈吗？
>
> A: 是的，为了实现线程、任务或者执行流的切换，通常每个任务（或者执行流）都会拥有一块独立的**内核栈**。这里的 **A** 和 **B** 正是两个不同的任务的**内核栈**，用于保存它们各自的上下文信息。

接下是`__switch`的实现：

```assembly
# os/src/task/switch.S
.altmacro
.macro SAVE_SN n
    sd s\n, (\n+2)*8(a0)
.endm
.macro LOAD_SN n
    ld s\n, (\n+2)*8(a1)
.endm
    .section .text
    .globl __switch
__switch:
    # __switch(
    #     current_task_cx_ptr: *mut TaskContext,
    #     next_task_cx_ptr: *const TaskContext
    # )
    # save kernel stack of current task
    sd sp, 8(a0)
    # save ra & s0~s11 of current execution
    sd ra, 0(a0)
    .set n, 0
    .rept 12
        SAVE_SN %n
        .set n, n + 1
    .endr
    # restore ra & s0~s11 of next execution
    ld ra, 0(a1)
    .set n, 0
    .rept 12
        LOAD_SN %n
        .set n, n + 1
    .endr
    # restore kernel stack of next task
    ld sp, 8(a1)
    ret
```

它的两个参数分别是当前和即将被切换到的 Trap 控制流的 `task_cx_ptr`. 分别通过寄存器 `a0/a1` 传入. 内核先把 `current_task_cx_ptr` 中包含的寄存器值逐个保存，再把 `next_task_cx_ptr` 中包含的寄存器值逐个恢复。

汇编语句的解释可以看[这里](#assembly). 对于`ld rd, offset(rs1)`，将内存地址 `rs1 + offset` 处的 8字节数据（64位）加载到寄存器 `rd`. 由[riscv-spec.pdf](https://riscv.org/wp-content/uploads/2024/12/riscv-calling.pdf)，`ra`作为 return address. 寄存器 `a0/a1` 分别作为 Function arguments 和 return values.

> 偏移量是如何定义的？

在任务切换时，通常会将寄存器上下文保存到一个任务上下文结构体中。这个结构体的内存布局可能类似于下面的结构：

| **偏移量** | **保存的寄存器** |
| ---------- | ---------------- |
| 0          | `ra`             |
| 8          | `sp`             |
| 16         | `s0`             |
| 24         | `s1`             |
| ...        | ...              |
| 104        | `s11`            |

Rust中的实现：

```rust
// os/src/task/context.rs
#[repr(C)]
/// task context structure containing some registers
pub struct TaskContext {
    /// Ret position after task switching
    ra: usize,
    /// Stack pointer
    sp: usize,
    /// s0-11 register, callee saved
    s: [usize; 12],
}
```

```rust
// os/src/task/switch.rs
global_asm!(include_str!("switch.S"));
extern "C" {
    /// Switch to the context of `next_task_cx_ptr`, saving the current context
    /// in `current_task_cx_ptr`.
    pub fn __switch(
        current_task_cx_ptr: *mut TaskContext, 
        next_task_cx_ptr: *const TaskContext
    );
}
```

`__switch`调用ref在`TaskManager`中.

### 管理多道程序 TaskManager

内核同时管理多个应用，如果外设处理的时间足够长，就先进行任务切换去执行其他应用，保证 CPU 不必浪费时间在等待外设上，而是几乎一直在进行计算。通过应用进行 `sys_yield` 系统调用来实现，这意味着它主动交出 CPU 的使用权给其他应用。

```rust
// os/src/task/task.rs
/// The task control block (TCB) of a task.
#[derive(Copy, Clone)]
pub struct TaskControlBlock {
    /// The task status in it's lifecycle
    pub task_status: TaskStatus,
    pub task_cx: TaskContext,
    pub syscall_times: [u32; MAX_SYSCALL_NUM],
    pub total_time: usize,
}
```

> 通过 `#[derive(...)]` 可以让编译器为你的类型提供一些 Trait 的默认实现。

内核需要一个全局的任务管理器来管理这些任务控制块.

```rust
// os/src/task/mod.rs
pub struct TaskManager {
    num_app: usize,
    /// use inner value to get mutable access
    inner: UPSafeCell<TaskManagerInner>,
}

/// Inner of Task Manager
pub struct TaskManagerInner {
    tasks: [TaskControlBlock; MAX_APP_NUM],
    /// id of current `Running` task
    current_task: usize,
}
```

然后用`lazy_static!`创建全局实例`TASK_MANAGER`即可.

`sys_yield`和`sys_exit`实现程序的主动暂停和主动退出，实现很简单，这里不讲了。

<img src="https://learningos.cn/rCore-Camp-Guide-2024A/_images/fsm-coop.png" style="zoom:67%;" />

当 CPU 第一次从内核态进入用户态时，进行**初始化**工作.

```rust
// os/src/task/mod.rs
...TASK_MANAGER: TaskManager= {	
	for (i, task) in tasks.iter_mut().enumerate() {
            task.task_cx = TaskContext::goto_restore(init_app_cx(i));
            task.task_status = TaskStatus::Ready;
	}
}
```

`init_app_cx` 在 `loader` 子模块中定义，向内核栈压入了一个 Trap 上下文，并返回压入 Trap 上下文后 `sp` 的值。 

`goto_restore` 保存传入的 `sp`，并将 `ra` 设置为 `__restore` 的入口地址，构造任务上下文后返回。这样，任务管理器中各个应用的任务上下文就得到了初始化。

```rust
// os/src/task/context.rs
impl TaskContext {
    /// Create a new task context with a trap return addr and a kernel stack pointer
    pub fn goto_restore(kstack_ptr: usize) -> Self {
        extern "C" {
            fn __restore();
        }
        Self {
            ra: __restore as usize,
            sp: kstack_ptr,
            s: [0; 12],
        }
    }
}
```

`ra: __restore as usize`通过将 `__restore` 函数的**地址**赋值给 `ra`，任务恢复时，CPU 会跳转到 `__restore` 函数，执行上下文恢复操作。这样，任务管理器中各个应用的任务上下文就得到了初始化。

> Q: 为何能如此做？
>
> A: 在 Rust 中，函数名本身是一个 **函数指针**，代表函数的起始地址。此处`ra`作为跳转的起始点，CPU 恢复上下文后，通过 `ret` 指令**跳转到 `ra` 指定的地址**，即 `__restore`.

```rust
// os/src/task/mod.rs
impl TaskManager {
	fn run_first_task(&self) -> ! {
        let mut inner = self.inner.exclusive_access();
        let task0 = &mut inner.tasks[0];
        task0.task_status = TaskStatus::Running;
        task0.total_time = get_time_ms();
        let next_task_cx_ptr = &task0.task_cx as *const TaskContext;
        drop(inner);
        let mut _unused = TaskContext::zero_init();
        // before this, we should drop local variables that must be dropped manually
        unsafe {
            __switch(&mut _unused as *mut TaskContext, next_task_cx_ptr);
        }
        panic!("unreachable in run_first_task!");
    }
}
```

`__switch` 第一个参数用于记录当前应用的任务上下文被保存在哪里，也就是当前应用内核栈的栈顶。我们显式声明了一个 `_unused` 变量，保存一些寄存器之后的 启动栈 栈顶的位置将会保存在此变量中。

这里声明此变量的意义仅仅是为了避免覆盖到其他数据，因为无论是此变量还是 启动栈 我们之后均不会涉及到，一旦应用开始运行，我们就开始在应用的用户栈和内核栈之间开始切换了。

### 分时多任务系统

现代的任务调度算法基本都是抢占式(Preemptive Scheduling)的，它要求每个应用只能连续执行一段时间，然后内核就会将它强制性切换出去。 一般将 **时间片** (Time Slice) 作为应用连续执行时长的度量单位，我们使用 **时间片轮转算法** (RR, Round-Robin) 来对应用进行调度。

**中断** (Interrupt) 和用于系统调用的 **陷入** `Trap` 一样都是异常 ，但是它们被触发的原因确是不同的。对于某个处理器核而言， 陷入与发起 陷入的指令执行是 **同步** (Synchronous) 的， 陷入被触发的原因一定能够追溯到某条指令的执行；而中断则**异步** (Asynchronous) 于当前正在进行的指令，也就是说中断来自于哪个外设以及中断如何触发完全与处理器正在执行的当前指令无关。可见[RISC-V 中断一览表](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter3/4time-sharing-system.html#id8).

RISC-V 要求处理器维护时钟计数器 `mtime`，还有另外一个 CSR `mtimecmp` 。 一旦计数器 `mtime` 的值超过了 `mtimecmp`，就会触发一次时钟中断。

```rust
// os/src/timer.rs
use riscv::register::time;
/// Get the current time in ticks
pub fn get_time() -> usize {
    time::read()
}
```

运行在 M 特权级的 SEE 已经预留了相应的接口，基于此编写的 `get_time` 函数可以取得当前 `mtime` 计数器的值。

```rust
// os/src/timer.rs
/// Set the next timer interrupt
pub fn set_next_trigger() {
    set_timer(get_time() + CLOCK_FREQ / TICKS_PER_SEC);
}
```

此处，会每 10ms 触发一个 S 特权级时钟中断.

获取当前时间的系统调用`sys_get_time`在 syscall/process.rs 中，`TimeVal`也实现在此处.

```rust
// os/src/trap/mod.rs
pub fn trap_hander(...) {
    match scause.cause() {
        Trap::Interrupt(Interrupt::SupervisorTimer) => {
            set_next_trigger();
            suspend_current_and_run_next();
        }
    }
}
```

触发了一个 S 特权级时钟中断的时候，首先用`set_next_trigger`重新设置一个 10ms 的计时器，再调用`suspend_current_and_run_next`.

```rust
// os/src/main.rs
pub fn rust_main() -> ! {
	// ...
    trap::enable_timer_interrupt();
    timer::set_next_trigger();
	// ...
}
```

在`main.rs`中需要相应的初始化。

<img src="https://i-blog.csdnimg.cn/blog_migrate/bfd6cc9edb52ec28989b28f4dd2435bf.png" style="zoom:67%;" />

`sstatus` 的 `sie` 为 S 特权级的中断使能，能够同时控制三种中断。

由于应用运行在 U 特权级，且 `sie` 寄存器被正确设置，该中断不会被屏蔽，而是 Trap 到 S 特权级内的我们的 `trap_handler` 里面进行处理，并顺利切换到下一个应用。

在某些时候，我们仍需要`yield`来节约 CPU 资源和满足事件生成条件。例如，我们可以通过 yield 来优化 轮询 (Busy Loop) 过程带来的 CPU 资源浪费。

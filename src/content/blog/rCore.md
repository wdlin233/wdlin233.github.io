---
author: wdlin
pubDatetime: 2025-03-23T21:13:00+08:00
modDatetime: 2025-03-23T21:13:06+08:00
title: rCore Learning Notes
slug: rCore-note
featured: false
draft: false
tags:
  - Rust
  - rCore
  - OS
description:
  rCore structures learning notes. 
---

## 特权级切换

从`syscall`开始，`syscall`的调用次数是在`TaskControlBlockInner`下的`TaskInfoBlock`自定义模块下的哈希表中被定义，自定义的任务运行时间统计`RunningTimeInfo`也在于此。获取任务的信息，就是访问这个`TCBInner`.

进入`trap_hander`意味着从用户态进入了内核态，此时停止用户态计时开启内核态计时，返回用户态时相反。`Processor`中定义的`user_timer_us`和`kernel_timer_us`是一个临时的值，在调用计时停止的函数时，会将值赋给具体任务中的计时器。

在进程转为`Blocked`, `Ready(Suspended)`或退出时会终止内核态计时，在`task_current_task`中。线程调度(schedule)时会开启内核态计时。这应当是没错的，因为只有程序处于`Running`状态时，才被认为是在执行。而进程状态的转换必须在内核态实现。在进程调度之后，开启新进程的内核态计时，之后通过`trap_hander`切回用户态。也就是说，此处进程状态的改变是旧进程内核态的结束和新进程内核态的开始。

在第一次运行任务时会更新第一次运行得时间并开启用户态计时。在`sys_task_info`中得到的时间根据要求是当前时间减去第一次运行的时间。

***

全局的`PROCESSOR`便于获取当前CPU上运行任务的状态。

上下文切换是通过`__alltraps`和`__restore`实现的。`__alltraps` 将 Trap 上下文保存在内核栈上，然后跳转 `trap_handler`（通过`jr t1`语句）；返回之后，`__restore` 从保存在内核栈上的 Trap 上下文恢复寄存器。

`schedule`中的`__switch`将当前的`TaskContext`指针和`idle_task_cx_ptr`交换，而`run_task`将`idle_task_cx_ptr`与下一个任务的交换。被切换的任务会将其`PCB`放入`TASK_MANAGER`的`ready_queue`中。

`TASK_MANAGER`是`TaskManager`的静态全局变量，掌管任务的就绪队列和终止队列。同一文件下的`PID2PCB`是由`pid`到`PCB`的 KV 键值对。

## 内存管理

### SATP, PTE and Address

首先要做的是区分`satp`(Supervisor Address Translation and Protection) , PTE 和 具体的地址。

`satp`用于控制分页的宏观状态，这和字长保持一致。例如RV64就以高4位作为MODE，16位ASID，剩下44位为PPN. 此处的PPN表示根页表的**物理**页号。

PTE是页表项，有64位。保存的是3级PPN和VRWX等各标志位，高位为 Reserved.

然后才是Sv39，意味着39位页式虚拟地址，而物理地址的位数是56. 此处的位数在于：地址偏移12位由单个页面的大小 4 KiB 决定，虚拟页号即 39 - 12 = 27 位。物理地址的位数除去 12 位偏移量，似乎根据每级页表页号的长度所决定，rCore采取 56 位，也存在 50 位的物理地址。但其至少需要与 PTE 中的 PPN 长度一致：如果 Reserved 为 10，PPN分别为26, 9, 9则PPN就为44位，如果 Reserved 为 16，对应的物理页号就会短一些？此处存疑，一般都按56位的物理地址设计。

`PageTableEntry` = `PhysPageNum` + `PTEFlags`. `PTEFlags`就是各标志位VRWX等的集合。

`VirtAddr`和`PhysAddr`都是对`usize`的封装。

***

### FrameAllocator

然后就需要考虑物理页帧的分配回收，就有了`FrameAllocator(Trait)`，具体作用在`StackFrameAllocator`上。`StackFrameAllocator`是对页号的分配实现对页帧的分配。

`FRAME_ALLOCATOR`是`StackFrameAllocator`封装后的全局实例，管理全局的物理页帧分配。

`FrameTracker`是对`PhysPageNum`运用 RAII 思想的封装，`frame_alloc`将会调用`FRAME_ALLOCATOR`下的`alloc()`返回包裹`FrameTracker`的`Option`.

***

### PageTable

`PageTable`即页表实现，保存`root_ppn`根节点页号。

```rust
pub fn get_pte_array(&self) -> &'static mut [PageTableEntry] {
	let pa: PhysAddr = (*self).into();
    unsafe { core::slice::from_raw_parts_mut(pa.0 as *mut PageTableEntry, 512) }
}
```

`get_pte_array()`将当前物理页号转换为物理地址后，让物理地址成为指向页表项的指针，并获取 512 个页表条目。

`find_pte_create`就是不断从虚拟页号`vpn` 中使用`get_pte_array`获取页表项后再取 `ppn (or as root_ppn for the next PageTable)`的过程，就是从`vpn`到`PTE`. 创建页表项的过程会将其推入`PageTable`下的`Vec<FrameTracker>`，在页表销毁后物理页帧就会被回收。

`map`就是用`find_pte_create`获取`PTE`后将其内容修改为`PhysPageNum` + `PTEFlags`. `unmap`就是将其修改为`PTE::empty()`. `translate`在`find_pte`基础上加了一个解引用，`translate_va`是`VirtAddr`到`PhysAddr`的映射。

***

### MemorySet

为了表达一串连续的虚拟地址，以及与之对应的更宏观的地址空间抽象。

`MapArea`就是对连续的**虚拟地址**的表示，`VPNRange`表示虚拟页号的范围；`BTreeMap<VirtPageNum, FrameTracker>`是表示虚实地址映射的KV键值对；`MapType`是映射方式，恒等映射就是将虚拟地址直接作为物理地址使用，`Framed`意味着虚拟页面对应一个新的物理页帧；`MapPermission`是`PTEFlags`的子集，仅一些简单的标志位，注意区分`MapPermission`是逻辑段的，而`PTEFlags`是`PageTableEntry`的一部分。

`MemorySet`就是将`PageTable`和各`MapArea`组合为一个整体，地址空间是一系列有关联的逻辑段，这样就将虚拟地址、页表整合起来，形成一个地址空间供进程使用。虽然是同义复写但是不得不这么做，因为地址空间的意义就在于它是一个地址空间。

内核代码的访存地址也是一个虚拟地址，需要经过MMU，由此构造而得内核地址空间。但是在rCore-Tutorial中，采用不同于以往的内核与应用同属同一地址空间而分上下两部分的设计（这点可以在《RISC-V体系结构编程与实践》中找到，180页），而是采用[全隔离内核](https://rustmagazine.github.io/rust_magazine_2021/chapter_7/trampoline-kernel.html)，因此才有跳板页（似乎 xv6 也是如此设计）。

根据寻址范围和Sv39的规定，地址空间有高 256GiB 和低 256GiB 的区分，具体可见于[最高的256GB与最低的256GB](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter4/3sv39-implementation-1.html#high-and-low-256gib)中。

内核地址空间中，最高的虚拟页面是一个跳板页，然后是**各应用的内核栈**，各内核栈之间用保护页面 (Guard Page) 隔开。低 256 GiB 是内核的`.text/.rodata/.data/.bss`等各逻辑段，恒等映射至物理内存。应用地址空间的高位也是跳板页，与内核地址空间不同的是多了一个 Trap 上下文。低 256 GiB 是各逻辑段和一个带保护页面的用户栈。布局可见于[内核与应用的地址空间](https://learningos.cn/rCore-Camp-Guide-2024A/chapter4/5kernel-app-spaces.html#id5)和[内核与应用的地址空间](https://learningos.cn/rCore-Camp-Guide-2024A/chapter4/5kernel-app-spaces.html#id6)。

`KERNEL_SPACE`作为内核地址空间的全局实例。关于将 Trap 上下文保存在次高页面而不是内核栈，是因为在内核栈中保存上下文需要先切换到内核地址空间，即使用`satp`切换页表，然后再使用一个通用寄存器保存内核栈栈顶指针，但硬件无法同时保存两个信息。

`map_trampoline`是结合汇编和链接脚本等综合实现的，比较复杂而且过于细节，作用就是添加一个跳表页。
### What is modified?

进行了如上改动后，在`TaskControlBlock`中加入应用的地址空间`memory_set`和应用地址空间次高页的 Trap 上下文的物理页号`trap_cx_ppn`. 这里直接使用物理页号应当是提高查找效率? `kernel_stack_position(app_id)`获取当前应用对应的内核栈位置，可以通过在内核地址空间的位置计算而得。`insert_framed_area`会实际将此内核栈的逻辑段加入内核地址空间中。这一部分后来发生了改写。

`PhysPageNum::get_mut<T>`实现了一个泛型，用于获取一个物理地址所指向内容的可变引用，这一实现基于可以参考`PhysAddr::get_mut<T>`和`as_mut()`的例子`ptr.as_mut().unwrap()`. 使`get_trap_cx`做到了根据物理页号取得对应的`TrapContext`.

`app_init_context`用于实现应用的上下文初始化，此处基于对`TrapContext`的改动加了新内容。Ch4 在内核初始化时将所有应用加载至全局应用管理器`TASK_MANAGER`中，这里后来发生了改写。`stvec`寄存器设置内核态中断处理流程的入口地址，在`trap_handler`中添加`set_kernel_trap_entry`，这是从 S 态到 S 态的 Trap 但是要到第九章才实现。`trap_handler`还添加了一些对其他寄存器的内容的 log. 返回用户态的`trap_return`也做了一些改写适应跳板页和新的内存布局。`translated_byte_buffer`以向量的形式返回以字节数组切片为类型的数组，在使用`UserBuffer`前的本章直接使用`print!("{}", core::str::from_utf8(buffer).unwrap());`作为`sys_write`，可以参考`str::from_utf8`的例子理解此处的调用。

## 进程调度

本章开始，`TaskManager`中处理器管理相关的内容被抽离出来，由`Processor`控制。
### TaskControlBlock

设计`PidHandle`来管理对`pid`的分配，与先前的`FrameAllocator`非常相似，结构上仅仅是删除了`end`因为不像栈一样存在限制。类似的，例化全局实例`PID_ALLOCATOR`. 而一个内核栈`KernelStack`对应一个`pid`. 此处 rCore 的代码与文档之间存在差异。`PID_ALLOCATOR`和`KSTACK_ALLOCATOR`都是对`RecycleAllocator`的全局例化，`KernelStack::new`被公有函数`kstack_alloc`所取代，原理不变仍是将`KSTACK_ALLOCATOR`分配得到的内核栈插入全局的内核地址空间`KERNEL_SPACE`中，使用`insert_franed_area`实现。

`TaskControlBlock`更改为如下构成：

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

`PidHandle`和`KernelStack`是初始化后不再变化的字段，可能发生变化的则放入`TaskControlBlockInner`中，如 Trap 上下文的物理页号`trap_cx_ppn`, 上下文`task_cx`和应用地址空间`memory_set`等，注意上下文和 Trap 上下文存在区别，分别用于进程调度和特权级切换，保存的内容也分别是内核态执行状态和用户态执行状态。
### TaskManager & Processor

`TaskManager`是一个关于`Arc<TaskControlBlock>`类型的`VecDeque`队列，具体方法比较简单，`TASK_MANAGER`是其全局实例。`Processor`由`current:Option<Arc<TaskControlBlock>>`和`idle_task_cx:TaskContext`组成，分别表示当前处理器上正在执行的任务和当前处理器上 idle 控制流的任务上下文。`PROCESSOR`是其全局实例。

`run_tasks`在任务管理器`TASK_MANAGER`取出(`fetch_task`)相应任务后，进行上下文切换。由于用`loop`包裹，将会循环取出任务并进行任务切换，不过`__switch`后会切出这个函数。对于`__switch`函数，内核先把 `current_task_cx_ptr` 中的寄存器值保存在当前指针的经过偏移的地址下，再将 `next_task_cx_ptr` 的寄存器恢复，具体可见[任务切换](https://learningos.cn/rCore-Camp-Guide-2024A/chapter3/2task-switching.html?highlight=__switch)，由此实现各寄存器值的切换。而`schedule`由`suspend_current_and_run_next`调用，当应用交出 CPU 使用权后，实施将当前进程挂起为`TaskStatus::Ready`后的上下文切换操作，将当前上下文保存并切换为`idle_task_cx`的上下文。切换回去之后，内核将跳转到 `run_tasks` 中 `__switch` 返回之后的位置，也即开启了下一轮的调度循环。根据[评论](https://github.com/rcore-os/rCore-Tutorial-Book-v3/issues/47#issuecomment-1109562363)的理解，使用空上下文实现了解耦。这一段就是调度的具体实现，并非调度算法。

`add_initproc`在`main`中被调用，作用是将全局的`INITPROC`加入`TASK_MANAGER`中.

### Syscall

`fork`就是创建另一个`TaskControlBlock`, 而这个子进程和父进程拥有初始一致但独立的地址空间和文件描述符表，当然`pid`必然不同。设计的难点在于`MemorySet::from_existed_user`, 可以理解为`MemorySet`的`clone`方法，这复制一个完全相同的地址空间，通过对`MapArea`下`vpn_range`对应`ppn`数据的修改，将原地址空间的数据复制到另一个地址空间中. `sys_fork`在创建子进程时唯一的区别是，子进程的返回值为 0. 因此需要取`trap_cx`并将`a0`寄存器赋 0. 

`exec`加载一个新的 ELF 文件并替换原有应用地址空间的内容. `sys_exec`先通过`translated_str`将该地址所对应的内容以`char`类型翻译后传回`String`，然后返回 ELF 格式的数据并执行`exec`替换当前进程的应用地址空间. 由于执行`sys_exec`时原有的地址空间会被销毁，各物理页帧都会被回收，为了应对失效的上下文`cx`, 在`trap_handler`中需要重建`cx`.

`sys_waitpid`寻找当前进程子进程中符合`pid`且为僵尸进程的进程，将其回收，附带有对`exit_code`的处理和对旧`pid`的返回. 
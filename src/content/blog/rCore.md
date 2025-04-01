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

从 `syscall` 开始，`syscall` 的调用次数是在 `TaskControlBlockInner` 下的 `TaskInfoBlock` 自定义模块下的哈希表中被定义，自定义的任务运行时间统计 `RunningTimeInfo` 也在于此。获取任务的信息，就是访问这个 `TCBInner`.

进入 `trap_hander` 意味着从用户态进入了内核态，此时停止用户态计时开启内核态计时，返回用户态时相反. `Processor` 中定义的 `user_timer_us` 和 `kernel_timer_us` 是一个临时的值，在调用计时停止的函数时，会将值赋给具体任务中的计时器。

在进程转为 `Blocked` , `Ready(Suspended)` 或退出时会终止内核态计时，在 `task_current_task` 中。线程调度(schedule)时会开启内核态计时。这应当是没错的，因为只有程序处于 `Running` 状态时，才被认为是在执行。而进程状态的转换必须在内核态实现。在进程调度之后，开启新进程的内核态计时，之后通过 `trap_hander` 切回用户态。也就是说，此处进程状态的改变是旧进程内核态的结束和新进程内核态的开始。

在第一次运行任务时会更新第一次运行得时间并开启用户态计时。在 `sys_task_info` 中得到的时间根据要求是当前时间减去第一次运行的时间。

***

全局的 `PROCESSOR` 便于获取当前CPU上运行任务的状态。

上下文切换是通过 `__alltraps` 和 `__restore` 实现的. `__alltraps` 将 Trap 上下文保存在内核栈上，然后跳转 `trap_handler`（通过 `jr t1` 语句）；返回之后，`__restore` 从保存在内核栈上的 Trap 上下文恢复寄存器。

`schedule` 中的 `__switch` 将当前的 `TaskContext` 指针和 `idle_task_cx_ptr` 交换，而 `run_task` 将 `idle_task_cx_ptr` 与下一个任务的交换。被切换的任务会将其 `PCB` 放入 `TASK_MANAGER` 的 `ready_queue` 中。

`TASK_MANAGER` 是 `TaskManager` 的静态全局变量，掌管任务的就绪队列和终止队列。同一文件下的 `PID2PCB` 是由 `pid` 到 `PCB` 的 KV 键值对。

## 内存管理

### SATP, PTE and Address

首先要做的是区分 `satp` (Supervisor Address Translation and Protection) , PTE 和 具体的地址。

`satp` 用于控制分页的宏观状态，这和字长保持一致。例如RV64就以高4位作为MODE，16位ASID，剩下44位为PPN. 此处的PPN表示根页表的**物理**页号。

PTE是页表项，有64位。保存的是3级PPN和VRWX等各标志位，高位为 Reserved.

然后才是Sv39，意味着39位页式虚拟地址，而物理地址的位数是56. 此处的位数在于：地址偏移12位由单个页面的大小 4 KiB 决定，虚拟页号即 39 - 12 = 27 位。物理地址的位数除去 12 位偏移量，似乎根据每级页表页号的长度所决定，rCore采取 56 位，也存在 50 位的物理地址。但其至少需要与 PTE 中的 PPN 长度一致：如果 Reserved 为 10，PPN分别为26, 9, 9则PPN就为44位，如果 Reserved 为 16，对应的物理页号就会短一些？此处存疑，一般都按56位的物理地址设计。

`PageTableEntry` = `PhysPageNum` + `PTEFlags`. `PTEFlags` 就是各标志位VRWX等的集合。

`VirtAddr` 和 `PhysAddr` 都是对 `usize` 的封装。

***

### FrameAllocator

然后就需要考虑物理页帧的分配回收，就有了 `FrameAllocator(Trait)` ，具体作用在 `StackFrameAllocator` 上. `StackFrameAllocator` 是对页号的分配实现对页帧的分配。

`FRAME_ALLOCATOR` 是 `StackFrameAllocator` 封装后的全局实例，管理全局的物理页帧分配。

`FrameTracker` 是对 `PhysPageNum` 运用 RAII 思想的封装，`frame_alloc` 将会调用 `FRAME_ALLOCATOR` 下的 `alloc()` 返回包裹 `FrameTracker` 的 `Option`.

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

***

### MemorySet

为了表达一串连续的虚拟地址，以及与之对应的更宏观的地址空间抽象。

`MapArea` 就是对连续的**虚拟地址**的表示，`VPNRange` 表示虚拟页号的范围； `BTreeMap<VirtPageNum, FrameTracker>` 是表示虚实地址映射的KV键值对；`MapType` 是映射方式，恒等映射就是将虚拟地址直接作为物理地址使用，`Framed` 意味着虚拟页面对应一个新的物理页帧；`MapPermission` 是 `PTEFlags` 的子集，仅一些简单的标志位，注意区分 `MapPermission` 是逻辑段的，而 `PTEFlags` 是 `PageTableEntry` 的一部分。

`MemorySet` 就是将 `PageTable` 和各 `MapArea` 组合为一个整体，地址空间是一系列有关联的逻辑段，这样就将虚拟地址、页表整合起来，形成一个地址空间供进程使用。虽然是同义复写但是不得不这么做，因为地址空间的意义就在于它是一个地址空间。

内核代码的访存地址也是一个虚拟地址，需要经过MMU，由此构造而得内核地址空间。但是在rCore-Tutorial中，采用不同于以往的内核与应用同属同一地址空间而分上下两部分的设计（这点可以在《RISC-V体系结构编程与实践》中找到，180页），而是采用[全隔离内核](https://rustmagazine.github.io/rust_magazine_2021/chapter_7/trampoline-kernel.html)，因此才有跳板页（似乎 xv6 也是如此设计）。

根据寻址范围和Sv39的规定，地址空间有高 256GiB 和低 256GiB 的区分，具体可见于[最高的256GB与最低的256GB](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter4/3sv39-implementation-1.html#high-and-low-256gib)中。

内核地址空间中，最高的虚拟页面是一个跳板页，然后是**各应用的内核栈**，各内核栈之间用保护页面 (Guard Page) 隔开。低 256 GiB 是内核的 `.text/.rodata/.data/.bss` 等各逻辑段，恒等映射至物理内存。应用地址空间的高位也是跳板页，与内核地址空间不同的是多了一个 Trap 上下文。低 256 GiB 是各逻辑段和一个带保护页面的用户栈。布局可见于[内核与应用的地址空间](https://learningos.cn/rCore-Camp-Guide-2024A/chapter4/5kernel-app-spaces.html#id5)和[内核与应用的地址空间](https://learningos.cn/rCore-Camp-Guide-2024A/chapter4/5kernel-app-spaces.html#id6)。

`KERNEL_SPACE` 作为内核地址空间的全局实例。关于将 Trap 上下文保存在次高页面而不是内核栈，是因为在内核栈中保存上下文需要先切换到内核地址空间，即使用 `satp` 切换页表，然后再使用一个通用寄存器保存内核栈栈顶指针，但硬件无法同时保存两个信息。

`map_trampoline` 是结合汇编和链接脚本等综合实现的，比较复杂而且过于细节，作用就是添加一个跳表页。
### What is modified?

进行了如上改动后，在 `TaskControlBlock` 中加入应用的地址空间 `memory_set` 和应用地址空间次高页的 Trap 上下文的物理页号 `trap_cx_ppn`. 这里直接使用物理页号应当是提高查找效率? `kernel_stack_position(app_id)` 获取当前应用对应的内核栈位置，可以通过在内核地址空间的位置计算而得。`insert_framed_area` 会实际将此内核栈的逻辑段加入内核地址空间中。这一部分后来发生了改写。

`PhysPageNum::get_mut<T>` 实现了一个泛型，用于获取一个物理地址所指向内容的可变引用，这一实现基于可以参考 `PhysAddr::get_mut<T>` 和 `as_mut()` 的例子 `ptr.as_mut().unwrap()`. 使 `get_trap_cx` 做到了根据物理页号取得对应的 `TrapContext`.

`app_init_context` 用于实现应用的上下文初始化，此处基于对 `TrapContext` 的改动加了新内容。Ch4 在内核初始化时将所有应用加载至全局应用管理器 `TASK_MANAGER` 中，这里后来发生了改写。`stvec` 寄存器设置内核态中断处理流程的入口地址，在 `trap_handler` 中添加 `set_kernel_trap_entry`，这是从 S 态到 S 态的 Trap 但是要到第九章才实现. `trap_handler` 还添加了一些对其他寄存器的内容的 log. 返回用户态的 `trap_return` 也做了一些改写适应跳板页和新的内存布局. `translated_byte_buffer` 以向量的形式返回以字节数组切片为类型的数组，在使用 `UserBuffer` 前的本章直接使用 `print!("{}", core::str::from_utf8(buffer).unwrap());` 作为 `sys_write`，可以参考 `str::from_utf8` 的例子理解此处的调用。

## 进程调度

本章开始，`TaskManager` 中处理器管理相关的内容被抽离出来，由 `Processor` 控制。
### TaskControlBlock

设计 `PidHandle` 来管理对 `pid` 的分配，与先前的 `FrameAllocator` 非常相似，结构上仅仅是删除了 `end` 因为不像栈一样存在限制。类似的，例化全局实例 `PID_ALLOCATOR`. 而一个内核栈 `KernelStack` 对应一个 `pid`. 此处 rCore 的代码与文档之间存在差异。`PID_ALLOCATOR` 和 `KSTACK_ALLOCATOR` 都是对 `RecycleAllocator` 的全局例化，`KernelStack::new` 被公有函数 `kstack_alloc` 所取代，原理不变仍是将 `KSTACK_ALLOCATOR` 分配得到的内核栈插入全局的内核地址空间 `KERNEL_SPACE` 中，使用 `insert_franed_area` 实现。

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

`run_tasks` 在任务管理器 `TASK_MANAGER` 取出 ( `fetch_task` ) 相应任务后，进行上下文切换。由于用 `loop` 包裹，将会循环取出任务并进行任务切换，不过 `__switch` 后会切出这个函数。对于 `__switch` 函数，内核先把 `current_task_cx_ptr` 中的寄存器值保存在当前指针的经过偏移的地址下，再将 `next_task_cx_ptr` 的寄存器恢复，具体可见[任务切换](https://learningos.cn/rCore-Camp-Guide-2024A/chapter3/2task-switching.html?highlight=__switch)，由此实现各寄存器值的切换。而 `schedule` 由 `suspend_current_and_run_next` 调用，当应用交出 CPU 使用权后，实施将当前进程挂起为`TaskStatus::Ready`后的上下文切换操作，将当前上下文保存并切换为`idle_task_cx`的上下文。切换回去之后，内核将跳转到 `run_tasks` 中 `__switch` 返回之后的位置，也即开启了下一轮的调度循环。根据[评论](https://github.com/rcore-os/rCore-Tutorial-Book-v3/issues/47#issuecomment-1109562363)的理解，使用空上下文实现了解耦。这一段就是调度的具体实现，并非调度算法。

`add_initproc` 在 `main` 中被调用，作用是将全局的 `INITPROC` 加入 `TASK_MANAGER` 中.

### Syscall

`fork`就是创建另一个`TaskControlBlock`, 而这个子进程和父进程拥有初始一致但独立的地址空间和文件描述符表，当然`pid`必然不同。设计的难点在于`MemorySet::from_existed_user`, 可以理解为`MemorySet`的`clone`方法，这复制一个完全相同的地址空间，通过对`MapArea`下`vpn_range`对应`ppn`数据的修改，将原地址空间的数据复制到另一个地址空间中. `sys_fork`在创建子进程时唯一的区别是，子进程的返回值为 0. 因此需要取`trap_cx`并将`a0`寄存器赋 0. 

`exec`加载一个新的 ELF 文件并替换原有应用地址空间的内容. `sys_exec`先通过`translated_str`将该地址所对应的内容以`char`类型翻译后传回`String`，然后返回 ELF 格式的数据并执行`exec`替换当前进程的应用地址空间. 由于执行`sys_exec`时原有的地址空间会被销毁，各物理页帧都会被回收，为了应对失效的上下文`cx`, 在`trap_handler`中需要重建`cx`.

`sys_waitpid`寻找当前进程子进程中符合`pid`且为僵尸进程的进程，将其回收，附带有对`exit_code`的处理和对旧`pid`的返回.

## 文件系统

### File Trait & UserBuffer

所有的文件访问都可以通过一个抽象接口`File`这一 Trait 进行，具体实现上是`Send + Sync`. 这为文件访问提供了并发的能力，参见[基于 Send 和 Sync 的线程安全](https://course.rs/advance/concurrency-with-threads/send-sync.html#send-%E5%92%8C-sync).

定义于`mm`模块中的`UserBuffer`是应用地址空间的一段缓冲区，文档中说这可以被理解为`&[u8]`切片，这似乎具有一定的二义性，就从类型`pub buffers: Vec<&'static mut [u8]>`理解即可. 这实际上是一组 utf8 编码构成的数组，在`Stdout`的`write`方法中直接使用了`from_utf8(*buffer)`. 参见[from_utf8](https://doc.rust-lang.org/std/str/fn.from_utf8.html). 

`UserBuffer`与`translated_byte_buffer` 方法是对应的，返回向量形式的字节(`u8`)数组切片，内核空间可以访问. 理清`UserBuffer`后，在此基础上构建了`Stdin::read`和`Stdout::write`.

### fd_table

每个进程都带有一个文件描述符表`fd_table`，记录请求打开并可以读写的文件集合。此表对应有文件描述符 (File Descriptor, `fd`) 以一个非负整数记录对应文件位置。`open`或`create`会返回对应描述符，而`close`需要提供描述符以关闭文件。

在`TaskControlBlockInner`中就有`pub fd_table: Vec<Option<Arc<dyn File + Send + Sync>>>`. 包含了共享引用和诸多特性，文档里有详细的解释. 其中`dyn`就是一种运行时多态. 在 fork 时，子进程完全继承父进程的文件描述符表，由此共享文件. 新建进程时，默认先打开标准输入文件`Stdin`和标准输出文件`Stdout`.

`sys_write`和`sys_read`根据对应的文件描述符`fd`从当前进程的`fd_table`中取出文件并执行对应的读写操作.

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

## 进程间通信

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

`make_pipe` 方法创建一个管道并返回它的读端和写端，

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

`TaskControlBlockInner::alloc_fd` 分配一个空闲文件描述符来访问新打开的文件。尝试找到一个空闲，没有就拓展文件描述符表的长度并再分配. 然后调用 `translated_refmut` 获取物理地址，将读端和写端的文件描述符写回到应用地址空间.

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

## 并发

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
```

线程共享进程的地址空间. 线程控制块包含线程初始化后不再变化的元数据，即所属进程和内核栈. 可能发生变化的元数据放在 `TaslControlBlockInner` 中，其中保存着线程各自运行所需的状态，即**上下文**；又有 `TaskUserRes` 包含线程标识符 `tid` 和线程的用户栈顶地址 `ustack_base`. 可以看出，线程拥有独立的内核栈与用户栈. `PID_ALLOCATOR` 和 `KSTACK_ALLOCATOR` 都基于 `RecycleAllocator` 是相比先前 `PidAllocator` 更泛用的版本.

每个进程拥有自己的进程标识符 (TID) ，可以使用 `sys_thread_create` 来创建一个线程. 这意味着在进程内部创建一个线程，该线程可以访问到进程所拥有的代码段， 堆和其他数据段。但内核会给这个新线程分配其专有的用户态栈. 由此实现每个线程的独立调度和执行. 同样的，每个线程也拥有一个独立的跳板页 `TRAMPOLINE`. 相比于 `fork` ，创建线程不需要建立新的地址空间. 线程之间也没有父子关系. 实现上比较简单，就是在新建 `TaskControlBlock` 后添加到 `tasks[new_task_tid]` 下.

线程用户态用到的资源会在 `exit` 系统调用后自动回收，而诸如内核栈等内核态线程资源则需要 `sys_waittid` 来回收以彻底销毁线程. 进程 / 主线程通过 `waittid` 来等待创建出的线程结束，并回收内核中的资源. `exit_current_and_run_next` 是比较繁琐的 进程 资源回收，由主线程发起. `sys_waittid` 是主线程进行调用，等待其他线程结束的方法，发现等待自身则返回，否则收集退出码 `exit_code` 清空此线程的线程控制块，因为 `Arc` 在引用计数为 0 时会自动释放.

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
/// Implementation of banker's algorithm
#[derive(Debug, Default)]
pub struct BankersAlgorithm {
    /// Available map, (Resource) = avaibable number
    available: BTreeMap<ResourceIdentifier, NumberOfResource>,
    /// (Task, Resource) = ResourceState {allo, need}
    task_state: BTreeMap<TaskIdentifier, BTreeMap<ResourceIdentifier, TaskResourcesState>>,
}

#[derive(Debug, Default)]
struct TaskResourcesState {
    // max: NumberOfResource,
    allocation: NumberOfResource,
    need: NumberOfResource,
}
```

对于 `TaskResourceState` 我们只需要 `allocation` 和 `need` ，这方便我们的分配操作，而 `max` 一般只是检查资源的合理性.

全局实例 `DEADLOCK_DETECT_ENABLED` 是对 `pid` 到 `BankerAlogorithm` 的 KV 键值对，用于开启对应 `pid` 的死锁避免算法.

考虑我们先前提到的步骤，对 `available` 的方法就是 `add_resource` ，以添加对应资源的数量. 对 `task_state` 的方法较多一些，`request` 是对 `record` 的封装，同时执行 `security_check`. `record` 就是试探性地将 `need` 数量增加；`alloc` / `acquire` 直接分配：

```rust
// Available[j] = Available[j] - Request[i,j];
*available -= request;
// Allocation[i,j] = Allocation[i,j] + Request[i,j];
task.allocation += request;
// Need[i,j] = Need[i,j] - Request[i,j];
task.need -= request;
```

`dealloc` / `release` 就是反过来执行. `security_check` 开启一个全为 `false` 的数组表示初始时所有线程都没有结束，执行上述所说 1 ~ 4 步进行安全性检查. 我认为这里是检查分配后是否会出现死锁，检查所有线程以保证系统安全.

在具体实现上，`add_resource` 添加在 `sys_mutex_create` 和 `sys_semaphore_create` 上. `request` 在 `sys_mutex_lock` 和 `sys_semaphore_down` 中用于检测安全性. `acquire` 意为获取资源仅在 `sys_semaphore_down` 中，因为 `sys_mutex_lock` 直接调用 `mutex.lock()`? 此处可能存在问题. `release` 在 `sys_mutex_unlock` 和 `sys_semaphore_up` 中都存在因为这意味着对已占用资源的释放. 

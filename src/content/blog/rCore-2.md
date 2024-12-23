---
author: wdlin
pubDatetime: 2024-11-20T21:48:17Z
modDatetime: 2024-12-22T22:57:02Z
title: rCore-2 ch4
slug: rCore-2
featured: false
draft: false
tags:
  - Rust
  - rCore
  - OS
description:
  rCore lab notes of chapter 4.
---

### ch4 分页机制与地址空间

这个视频作了一个不错的概述: [【操作系统】内存管理——地址空间](https://www.bilibili.com/video/BV1oi4y1T7RP/?share_source=copy_web&vd_source=7065d846d368bb90906c142c279a2832).

用`satp`CSR的MODE字段来开启MMU.

<img src="https://learningos.cn/rCore-Camp-Guide-2024A/_images/satp.png" alt="satp CSR" style="zoom:67%;" />

#### 物理地址/虚拟地址/物理页面/物理页帧

单个页面的大小设置为 4KiB(`PAGE_SIZE`) ，每个虚拟页面和物理页帧都按 4 KB 对齐。 4KiB 需要用 12 位字节地址来表示，构成低 12 位即 **页内偏移** (Page Offset) 。

虚拟地址的高 27 位，即 [38:12] 为它的虚拟页号 VPN； 物理地址的高 44 位，即 [55:12] 为它的物理页号 PPN。页号可以用来定位一个虚拟/物理地址属于哪一个虚拟页面/**物理页帧**。

<img src="https://learningos.cn/rCore-Camp-Guide-2024A/_images/sv39-va-pa.png" alt="Address" style="zoom:67%;" />

于是对地址类型，有取页内偏移量的操作`page_offset`，用二进制与运算实现；取页码`PPN`用二进制除法实现取`PhysAddr`的高位：

<!--more-->

```rust
// os/src/mm/address.rs
impl PhysAddr {
    /// Get the (floor) physical page number
    pub fn floor(&self) -> PhysPageNum {
        PhysPageNum(self.0 / PAGE_SIZE)
    }
    /// Get the page offset of physical address
    //  pub const PAGE_SIZE: usize = 4096 (0x1000) = ..1_0000_0000_0000
    pub fn page_offset(&self) -> usize {
        self.0 & (PAGE_SIZE - 1) // 1111_1111_1111
    }
}

// PhysAddr -> PhysPageNum
impl From<PhysAddr> for PhysPageNum {
    fn from(v: PhysAddr) -> Self {
        assert_eq!(v.page_offset(), 0);
        v.floor()
    }
}

// PhysPageNum -> PhysAddr
impl From<PhysPageNum> for PhysAddr {
    fn from(v: PhysPageNum) -> Self {
        Self(v.0 << PAGE_SIZE_BITS)
    }
}
```

地址转换是以页为单位进行的，**转换前后地址页内偏移部分不变**。MMU 只是从虚拟地址中取出 27 位虚拟页号， 在页表中查到其对应的物理页号，如果找到，就将得到的 44 位的物理页号与 12 位页内偏移拼接到一起，形成 56 位物理地址。

#### 页表项PTE

在页表中以虚拟页号作为索引不仅能够查到物理页号，还能查到一组保护位，它控制了应用对地址空间每个虚拟页面的访问权限。但实际上还有更多的标志位，物理页号和全部的标志位以某种固定的格式保存在一个结构体中，它被称为 **页表项** (PTE, Page Table Entry) ，是利用虚拟页号在页表中查到的结果。低位8位标志位`PTEFlags`具体可见[SV39 多级页表的硬件机制 - rCore-Tutorial-Book-v3 3.6.0-alpha.1 文档](https://rcore-os.cn/rCore-Tutorial-Book-v3/chapter4/3sv39-implementation-1.html#id5).

<img src="https://learningos.cn/rCore-Camp-Guide-2024A/_images/sv39-pte.png" alt="PTE" style="zoom:67%;" />

`ppn`函数将`PTE`的PPN部分与0xFFFFFFFFFFF（十六进制形式的 44 个 1）取与，将得到的结果用`into()`进行转换位`PhysPageNum`.

```rust
// os/src/mm/page_table.rs
/// page table entry structure
pub struct PageTableEntry {
    /// bits of page table entry
    pub bits: usize,
}

impl PageTableEntry {
    /// Create a new page table entry
    pub fn new(ppn: PhysPageNum, flags: PTEFlags) -> Self {
        PageTableEntry {
            bits: ppn.0 << 10 | flags.bits as usize,
        }
    }
    /// Get the physical page number from the page table entry
    pub fn ppn(&self) -> PhysPageNum {
        (self.bits >> 10 & ((1usize << 44) - 1)).into()
    }
    /// Get the flags from the page table entry
    pub fn flags(&self) -> PTEFlags {
        PTEFlags::from_bits(self.bits as u8).unwrap()
    }
}
```

#### 物理页帧与FrameAllocator

```rust
// os/src/config.rs
pub const MEMORY_END: usize = 0x80800000;
```

我们硬编码整块物理内存的终止物理地址为 `0x80800000` 。 而物理内存的起始物理地址为 `0x80000000` ， 意味着我们将可用内存大小设置为 8MiB ，当然也可以设置的更大一点。

> 这里应当与ekernel的实现有关系，直接运算得到的结果并不是8MiB. 待补充...

实现物理页帧管理器，以物理页号为单位进行物理页帧的分配和回收。物理页号区间 [ `current` , `end` ) 此前均 *从未* 被分配出去过，而向量 `recycled` 以后入先出的方式保存了被回收的物理页号（内核堆）。

```rust
// os/src/mm/frame_allocator.rs
pub struct StackFrameAllocator {
    current: usize, //空闲内存空间起始物理页号
    end: usize,
    recycled: Vec<usize>,
}

impl StackFrameAllocator {
    pub fn init(&mut self, l: PhysPageNum, r: PhysPageNum) {
        self.current = l.0;
        self.end = r.0;
        // trace!("last {} Physical Frames.", self.end - self.current);
    }
}
```

将Trait`FrameAllocator`作用给`StackFrameAllocator`. 分配 `alloc` 的时候，首先会检查栈 `recycled` 内有没有之前回收的物理页号，如果有的话直接弹出栈顶并返回；否则的话我们只能从之前从未分配过的物理页号区间 [ `current` , `end` ) 上进行分配；回收的时候检测回收页面合法性

```rust
// os/src/mm/frame_allocator.rs
impl FrameAllocator for StackFrameAllocator {
    fn new() -> Self {
        Self {
            current: 0,
            end: 0,
            recycled: Vec::new(),
        }
    }
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
    fn dealloc(&mut self, ppn: PhysPageNum) {
        let ppn = ppn.0;
        // validity check
        if ppn >= self.current || self.recycled.iter().any(|&v| v == ppn) {
            panic!("Frame ppn={:#x} has not been allocated!", ppn);
        }
        // recycle
        self.recycled.push(ppn);
        
        // another version of validity check
        // if ppn >= self.current || self.recycled
        //     .iter()
        //     .find(|&v| {*v == ppn})
        //     .is_some() {
        //     panic!("Frame ppn={:#x} has not been allocated!", ppn);
        // }
    }
}
```

对`StackFrameAllocator`进行全局实例化与初始化.

```rust
// os/src/mm/frame_allocator.rs
type FrameAllocatorImpl = StackFrameAllocator;
lazy_static! {
    /// frame allocator instance through lazy_static!
    pub static ref FRAME_ALLOCATOR: UPSafeCell<FrameAllocatorImpl> =
        unsafe { UPSafeCell::new(FrameAllocatorImpl::new()) };
}
/// initiate the frame allocator using `ekernel` and `MEMORY_END`
pub fn init_frame_allocator() {
    extern "C" {
        fn ekernel();
    }
    FRAME_ALLOCATOR.exclusive_access().init(
        PhysAddr::from(ekernel as usize).ceil(),
        PhysAddr::from(MEMORY_END).floor(),
    );
}
```

对`FrameTracker`的构建如下，`frame_alloc` 的返回值类型并不是 物理页号 `PhysPageNum` ，而是将其进一步包装为一个 `FrameTracker`. 将一个物理页帧的生命周期绑定到一个 `FrameTracker` 变量上，当一个 `FrameTracker` 被创建的时候，我们需要从 `FRAME_ALLOCATOR` 中分配一个物理页帧：

```rust
// os/src/mm/frame_allocator.rs
pub struct FrameTracker {
    /// physical page number
    pub ppn: PhysPageNum,
}

impl FrameTracker {
    /// Create a new FrameTracker
    pub fn new(ppn: PhysPageNum) -> Self {
        // page cleaning
        let bytes_array = ppn.get_bytes_array();
        for i in bytes_array {
            *i = 0;
        }
        Self { ppn }
    }
}
```

可以看到，物理页帧`FrameTracker`仅由`ppn:PhysPageNum`所组成，而不包含偏移量。因为，**每个物理页帧对应一连续的物理地址范围**。要从物理页帧和页内偏移计算出具体物理地址，有公式：

PhysAddr = FrameNumber * PageSize + Offset

当一个 `FrameTracker` 生命周期结束被编译器回收的时候，它的 `drop` 方法会**自动**被编译器调用. 

```rust
// os/src/mm/frame_allocator.rs
impl Drop for FrameTracker {
    fn drop(&mut self) {
        frame_dealloc(self.ppn);
    }
}
```

> Drop Trait有诸多便捷的特性，详细可见[管理 SV39 多级页表 - rCore-Tutorial-Book-v3 3.6.0-alpha.1 文档](https://rcore-os.cn/rCore-Tutorial-Book-v3/chapter4/4sv39-implementation-2.html#id4)

#### 多层页表

每个应用的地址空间都对映一个不同的多级页表，这也就意味这不同页表的起始地址（即页表根节点的地址）是不一样的。因此 `PageTable` 要保存它根节点的物理页号 `root_ppn` 作为**页表唯一的区分标志**。此外， 向量 `frames` 以 `FrameTracker` 的形式保存了页表所有的节点（包括根节点）所在的**物理页帧**。

`frame`是一个`FrameTracker`类型的变量，其具有唯一的结构体元素`ppn`(PhysPageNum).

```rust
// os/src/mm/page_table.rs
pub struct PageTable {
    root_ppn: PhysPageNum,
    frames: Vec<FrameTracker>,
}

impl PageTable {
    /// Create a new page table
    pub fn new() -> Self {
        let frame = frame_alloc().unwrap();
        PageTable {
            root_ppn: frame.ppn,
            frames: vec![frame],
        }
    }
}
```

为了接续接下来的内容，此处我们需要理解SV39的页表机制。每个节点都被保存在一个物理页帧中。在 SV39 中，页表是分层结构，每一层的页表被称为一个**节点**。这些节点的作用是存储虚拟地址到物理地址的映射关系，或者指向下一层的页表。一个节点包含多个页表项（Page Table Entries, PTEs），每个页表项要么存储物理页帧地址，要么存储指向下一层页表的物理地址。**每个节点会占据一个物理页帧**。

在 SV39 中：

- 一个页表条目（PTE）是 8 字节。
- 一个物理页帧大小是 4 KB。

因此，一个物理页帧可以容纳： 4KB / 8B = 512 即 **512 个页表条目**。

通过这种设计，每个页表节点恰好是一个物理页帧，这简化了硬件设计：

- 硬件可以直接通过 PPN（物理页帧号）定位到对应的页表节点。
- 页表查找只需通过偏移（Offset）找到具体的 PTE，而无需动态分配额外内存

其实可以理解为，页表中的每一个基本单位都是一个物理页帧，此称为节点。

由此我们可以开始构建映射：为了 MMU 能够通过地址转换正确找到应用地址空间中的数据实际被内核放在内存中 位置，操作系统需要动态维护一个**虚拟页号**到**页表项**的映射，支持插入/删除键值对，其方法签名如下：

```rust
// os/src/mm/page_table.rs
impl PageTable {
    pub fn map(&mut self, vpn: VirtPageNum, ppn: PhysPageNum, flags: PTEFlags);
    pub fn unmap(&mut self, vpn: VirtPageNum);
}
```

每个节点都被保存在一个物理页帧中，在多级页表的架构中，一个节点对应的物理页号作为指针指向该节点。一旦我们知道了指向某一个节点的物理页号，我们就需要能够修改这个节点的内容。在操作某个多级页表或是管理物理页帧的时候，我们要能够自由的读写一个给定的物理页号对应的物理页帧上的数据。

此处我们采用由`vpn`到`ppn`的**恒等映射**，此处还有其他映射方式如页表自映射等，可见[BlogOS中的相关介绍](https://os.phil-opp.com/paging-implementation/#accessing-page-tables).

#### 虚实地址映射

应用和内核的地址空间是隔离的。而直接访问物理页帧的操作只会在内核中进行， 应用无法看到物理页帧管理器和多级页表等内核数据结构。

```rust
// os/src/mm/address.rs
impl PhysPageNum {
    pub fn get_pte_array(&self) -> &'static mut [PageTableEntry] {
        let pa: PhysAddr = self.clone().into();
        unsafe {
            core::slice::from_raw_parts_mut(pa.0 as *mut PageTableEntry, 512)
        }
    }
    pub fn get_bytes_array(&self) -> &'static mut [u8] {
        let pa: PhysAddr = self.clone().into();
        unsafe {
            core::slice::from_raw_parts_mut(pa.0 as *mut u8, 4096)
        }
    }
    pub fn get_mut<T>(&self) -> &'static mut T {
        let pa: PhysAddr = self.clone().into();
        unsafe {
            (pa.0 as *mut T).as_mut().unwrap()
        }
    }
}
```

此处的512是因为一个页占4KB，每个页表项占 8 字节，4096 / 8 总共 512 项，表示一个页表节点中的页表项数量。而4096就表示一个页的大小4 KB，即一个物理页帧的字节总数。

我们构造**可变引用**来直接访问一个物理页号 `PhysPageNum` 对应的物理页帧，不同的引用类型对应于物理页帧上的一种不同的 内存布局。如 `get_pte_array` 返回的是一个页表项定长数组的可变引用，可以用来修改多级页表中的一个节点；而 `get_bytes_array` 返回的是一个字节数组的可变引用，可以以字节为粒度对物理页帧上的数据进行访问。

在实现方面，先把物理页号转为物理地址 `PhysAddr` ，再转成 usize 形式的物理地址。接着，将它转为裸指针来访问物理地址指向的物理内存。在分页机制开启之后，虽然裸指针被视为一个虚拟地址， 但虚拟地址会映射到一个相同的物理地址，也成立。

> 注意，返回值类型上附加静态生命周期泛型 `'static` 以绕过 Rust 编译器的借用检查。实质上可以将返回的类型看作裸指针，因为它也只是标识数据存放的位置以及类型。但与裸指针不同的是，无需通过 `unsafe` 的解引用，而可以作为正常的可变引用一样直接访问。

`map`和`unmap`都依赖于在多级页表中找到一个虚拟地址对应的页表项的过程，找到之后，只要修改页表项的内容即可完成键值对的插入和删除。

```rust
// os/src/mm/address.rs
impl VirtPageNum {
    /// Get the indexes of the page table entry
    pub fn indexes(&self) -> [usize; 3] {
        let mut vpn = self.0;
        let mut idx = [0usize; 3];
        for i in (0..3).rev() {
            idx[i] = vpn & 511;
            vpn >>= 9;
        }
        idx
    }
}

// os/src/mm/page_table.rs
impl PageTable {
    fn find_pte_create(&mut self, vpn: VirtPageNum) -> Option<&mut PageTableEntry> {
        /// Find PageTableEntry by VirtPageNum, create a frame for a 4KB page table if not exist
        let idxs = vpn.indexes();
        let mut ppn = self.root_ppn;
        let mut result: Option<&mut PageTableEntry> = None;
        for i in 0..3 {
            let pte = &mut ppn.get_pte_array()[idxs[i]];
            if i == 2 {
                result = Some(pte);
                break;
            }
            if !pte.is_valid() {
                let frame = frame_alloc().unwrap();
                *pte = PageTableEntry::new(frame.ppn, PTEFlags::V);
                self.frames.push(frame);
            }
            ppn = pte.ppn();
        }
        result
    }
}
```

其中，  `indexes` 用于取出虚拟页号`vpn`的三级页索引，并按照从高到低的顺序返回。`find_pte_create`用于在`vpn`中三级页索引的指定下，逐级遍历各层`pte`。如果在遍历的过程中发现有节点尚未创建则会新建一个节点。

为了 **MMU** 能够通过地址转换正确找到应用地址空间中的数据实际被内核放在内存中 位置，操作系统需要动态维护一个**虚拟页号**到**页表项**的映射. 由此即可实现`map`与`unmap`：

```rust
// os/src/mm/page_table.rs
impl PageTable {
    /// set the map between virtual page number and physical page number
    pub fn map(&mut self, vpn: VirtPageNum, ppn: PhysPageNum, flags: PTEFlags) {
        let pte = self.find_pte_create(vpn).unwrap();
        assert!(!pte.is_valid(), "vpn {:?} is mapped before mapping", vpn);
        *pte = PageTableEntry::new(ppn, flags | PTEFlags::V);
    }
    /// remove the map between virtual page number and physical page number
    pub fn unmap(&mut self, vpn: VirtPageNum) {
        let pte = self.find_pte_create(vpn).unwrap();
        assert!(pte.is_valid(), "vpn {:?} is invalid before unmapping", vpn);
        *pte = PageTableEntry::empty();
    }
}
```

如果`vpn`对应的`pte`不可用，说明此时可以使用`map`进行映射.

> 目前的实现方式并不打算对物理页帧耗尽的情形做任何处理而是直接 `panic` 退出。因此在前面的代码中能够看到 很多 `unwrap` ，这种使用方式并不为 Rust 所推荐，只是由于简单起见暂且这样做。

我们还需要 `PageTable` 提供一种不经过 MMU 而是手动查页表的方法:

```rust
// os/src/mm/page_table.rs
impl PageTable {
    /// Temporarily used to get arguments from user space.
    pub fn from_token(satp: usize) -> Self {
        Self {
            root_ppn: PhysPageNum::from(satp & ((1usize << 44) - 1)),
            frames: Vec::new(),
        }
    }
    fn find_pte(&self, vpn: VirtPageNum) -> Option<&PageTableEntry> {
        let idxs = vpn.indexes();
        let mut ppn = self.root_ppn;
        let mut result: Option<&PageTableEntry> = None;
        for i in 0..3 {
            let pte = &ppn.get_pte_array()[idxs[i]];
            if i == 2 {
                result = Some(pte);
                break;
            }
            if !pte.is_valid() {
                return None;
            }
            ppn = pte.ppn();
        }
        result
    }
    pub fn translate(&self, vpn: VirtPageNum) -> Option<PageTableEntry> {
        self.find_pte(vpn)
            .map(|pte| {pte.clone()})
    }
}
```

`translate` 通过调用 `find_pte` 来实现，如果能够找到页表项，那么它会将页表项拷贝一份并返回，否则就返回一个 `None`. 实现的是虚拟页号向PTE的转换.

#### 逻辑段与地址空间

通过**逻辑段**`MapArea`实现地址空间抽象，指地址区间中的一段实际可用（即 MMU 通过查多级页表 可以正确完成地址转换）的地址连续的**虚拟地址区间**，该区间内包含的所有虚拟页面都以一种相同的方式映射到物理页帧，具有可读/可写/可执行等属性。

```rust
// os/src/mm/memory_set.rs
/// map area structure, controls a contiguous piece of virtual memory
pub struct MapArea {
    vpn_range: VPNRange,
    data_frames: BTreeMap<VirtPageNum, FrameTracker>,
    map_type: MapType,
    map_perm: MapPermission,
}
```

对于**恒等映射**`Identical`，虚拟地址与物理地址完全一致，物理页号就等于虚拟页号，无需额外分配新的物理页帧；对Frame映射，可以指定`MapType::Framed`实现**动态分配**，即虚拟地址不直接对应任何已有的物理地址，而是通过页表映射到操作系统分配的空闲物理页帧，页表项中的物理页号即被分配的物理页帧的物理页号。此时，键值对容器 `BTreeMap` 中存放的物理页帧被用来存放实际内存数据。

```rust
// os/src/mm/memory_set.rs
impl MapArea{	
	pub fn map_one(&mut self, page_table: &mut PageTable, vpn: VirtPageNum) {
        let ppn: PhysPageNum;
        match self.map_type {
            MapType::Identical => {
                ppn = PhysPageNum(vpn.0);
            }
            MapType::Framed => {
                let frame = frame_alloc().unwrap();
                ppn = frame.ppn;
                self.data_frames.insert(vpn, frame);
            }
        }
        let pte_flags = PTEFlags::from_bits(self.map_perm.bits).unwrap();
        page_table.map(vpn, ppn, pte_flags);
    }
    pub fn map(&mut self, page_table: &mut PageTable) {
        for vpn in self.vpn_range {
            self.map_one(page_table, vpn);
        }
    }
    /// data: start-aligned but maybe with shorter length
    /// assume that all frames were cleared before
    pub fn copy_data(&mut self, page_table: &mut PageTable, data: &[u8]) {
        assert_eq!(self.map_type, MapType::Framed);
        let mut start: usize = 0;
        let mut current_vpn = self.vpn_range.get_start();
        let len = data.len();
        loop {
            let src = &data[start..len.min(start + PAGE_SIZE)];
            let dst = &mut page_table
                .translate(current_vpn)
                .unwrap()
                .ppn()
                .get_bytes_array()[..src.len()];
            dst.copy_from_slice(src);
            start += PAGE_SIZE;
            if start >= len {
                break;
            }
            current_vpn.step();
        }
    }
}
```

`map`可以对逻辑段所属地址空间的多级页表中加入每个虚拟页面的键值对映射，通过遍历逻辑段内所有虚拟页面而实现。`copy_data` 方法将切片 `data` 中的数据拷贝到当前逻辑段实际被内核放置在的各物理页帧上，从而在地址空间中通过该逻辑段就能访问这些数据。

**地址空间**`MemorySet`是一系列有关联的逻辑段，用来表明正在运行的应用所在执行环境中的可访问内存空间，在这个内存空间中，包含了一系列的**不一定连续**的逻辑段。这样我们就有任务（进程）的地址空间，内核的地址空间等说法了。

```rust
// os/src/mm/memory_set.rs
/// address space
pub struct MemorySet {
    page_table: PageTable,
    areas: Vec<MapArea>,
}
```

注意， `PageTable` 下 挂着所有多级页表的节点所在的物理页帧，而每个 `MapArea` 下则挂着对应逻辑段中的数据所在的物理页帧，这两部分合在一起构成了一个地址空间所需的所有物理页帧。

```rust
// os/src/mm/memory_set.rs
impl MemorySet{	
	/// Assume that no conflicts.
    pub fn insert_framed_area(
        &mut self,
        start_va: VirtAddr,
        end_va: VirtAddr,
        permission: MapPermission,
    ) {
        self.push(
            MapArea::new(start_va, end_va, MapType::Framed, permission),
            None,
        );
    }
    fn push(&mut self, mut map_area: MapArea, data: Option<&[u8]>) {
        map_area.map(&mut self.page_table);
        if let Some(data) = data {
            map_area.copy_data(&mut self.page_table, data);
        }
        self.areas.push(map_area);
    }
}
```

`push` 方法可以在当前地址空间插入一个新的逻辑段 `map_area` ，如果它是以 `Framed` 方式映射到 物理内存，还可以可选地在那些被映射到的物理页帧上写入一些初始化数据 `data`.  而`insert_framed_area` 方法调用 `push` ，在当前地址空间插入一个映射到物理内存的逻辑段，该方法需保证同一地址空间内的任意两个逻辑段不能存在交集，从内核和应用的地址空间布局可以看出。

#### 内核地址空间

在分页模式开启之后，内核与应用代码的访存地址都需要通过 MMU 转换变成物理地址，再交给 CPU 的访存单元去访问物理内存。地址空间抽象的重要意义在于 **隔离** (Isolation) ，执行每个应用的代码时，内核都需要控制 MMU 使用此应用地址空间对应的多级页表进行地址转换。每个应用地址空间只能访问自己的数据而无法触及其他应用或是内核的数据。

内核代码的访存地址也会被视为一个虚拟地址，并需要经过 MMU 的地址转换。因此我们需要为内核构造一个地址空间，它除了仍然允许内核的各数据段能够被正常访问之外，还需要包含所有应用的内核栈以及一个**跳板** (Trampoline) .

在[最高的256GB与最低的256GB](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter4/3sv39-implementation-1.html#high-and-low-256gib)中，曾提过只有最低的256GB`0x0000_0000_0000~0x0000_7FFF_FFFF`，最高的256GB`0xFFFF_8000_0000~0xFFFF_FFFF_FFFF`，是可以通过MMU检查的，而中间部分`0x0000_8000_0000~0xFFFF_7FFF_FFFF`都为非法地址。

下图是软件看到的 64 位地址空间在 SV39 分页模式下实际可能通过 MMU 检查的最高256GB， 跳板放在最高的一个虚拟页面中。接下来则是从高到低放置每个应用的内核栈，内核栈的大小由 `config` 子模块的 `KERNEL_STACK_SIZE` 给出。

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/kernel-as-high.png" alt="最高256GB" style="zoom:67%;" />

相邻两个内核栈之间会预留一个 **保护页面** (Guard Page) ，它是内核地址空间中的空洞，多级页表中并不存在与它相关的映射。 它的意义在于当内核栈空间不足（如调用层数过多或死递归）的时候，代码会尝试访问空洞区域内的虚拟地址，然而它无法在多级页表中找到映射，便会触发异常，此时控制权会交给 trap handler 对这种情况进行 处理。

内核地址空间的低 256GiB 的布局：

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/kernel-as-low.png" alt="低256GB" style="zoom:67%;" />

四个逻辑段 `.text/.rodata/.data/.bss` 被恒等映射到物理内存。此外，内核地址空间中需要存在一个恒等映射到内核数据段之外的可用物理页帧的逻辑段，这样才能在启用页表机制之后，内核仍能以纯软件的方式读写这些物理页帧。`new_kernel`函数作用于创建一个包含低256GiB布局的地址空间，通过`push()`各逻辑段组成。

#### 应用地址空间

我们希望效仿内核地址空间的设计，同样借助页表机制使应用地址空间的各个逻辑段也可有不同的访问方式限制，以提早检测应用的错误并及时将其终止。在第三章中，每个应用链接脚本中的起始地址被要求是不同的，这样代码和数据存放的位置才不会产生冲突。现在，所有应用程序都将使用同样的起始地址，所有应用可以使用同一个链接脚本`linker.ld`.

<img src="https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/_images/app-as-full.png" alt="应用地址空间" style="zoom:67%;" />

左侧给出了应用地址空间最低 256GiB 的布局：从 0x0 开始向高地址放置应用内存布局中的各个逻辑段，最后放置带有一个保护页面的用户栈。这些逻辑段都是以 `Framed` 方式映射到物理内存的。`U`表示可以在用户特权级时执行访问。右侧则给出了最高的 256GiB ， 它和内核地址空间一样将跳板放置在最高页，还将 Trap 上下文放置在次高页中。

在 `os/src/build.rs` 中，我们不再将丢弃了所有符号的应用二进制镜像链接进内核，而是直接使用 ELF 格式的可执行文件， 因为在前者中内存布局中各个逻辑段的位置和访问限制等信息都被裁剪掉了。而 `loader` 子模块也变得极其精简。

```rust
// os/src/loader.rs
/// Get the total number of applications.
pub fn get_num_app() -> usize {
    extern "C" {
        fn _num_app();
    }
    unsafe { (_num_app as usize as *const usize).read_volatile() }
}

/// get applications data
pub fn get_app_data(app_id: usize) -> &'static [u8] {
    extern "C" {
        fn _num_app();
    }
    let num_app_ptr = _num_app as usize as *const usize;
    let num_app = get_num_app();
    let app_start = unsafe { core::slice::from_raw_parts(num_app_ptr.add(1), num_app + 1) };
    assert!(app_id < num_app);
    unsafe {
        core::slice::from_raw_parts(
            app_start[app_id] as *const u8,
            app_start[app_id + 1] - app_start[app_id],
        )
    }
}
```

> 此处原文档对`from_elf()`进行了讲解，就是将 `get_app_data` 得到的 ELF 格式数据进行解析，插入各逻辑段，得到一个完整的**应用地址空间**。

#### 内核初始化

SBI初始化完成后，CPU将跳转到内核入口点并在S特权级上运行，此时还未开启分页模式。在内核初始化期间，将过渡到分页模式。

我们先创建内核地址空间的全局实例，这里使用经典的 `Arc<Mutex<T>>` 组合是因为我们既需要 `Arc<T>` 提供的共享引用，也需要 `Mutex<T>` 提供的互斥访问：

```rust
// os/src/memory_set.rs
lazy_static! {
    /// The kernel's initial memory mapping(kernel address space)
    pub static ref KERNEL_SPACE: Arc<UPSafeCell<MemorySet>> =
        Arc::new(unsafe { UPSafeCell::new(MemorySet::new_kernel()) });
}
```

在 `rust_main` 函数中，我们首先调用 `mm::init` 进行内存管理子系统的初始化：

```rust
// os/src/mm/mod.rs
pub use memory_set::KERNEL_SPACE;
/// initiate heap allocator, frame allocator and kernel space
pub fn init() {
    heap_allocator::init_heap();
    frame_allocator::init_frame_allocator();
    KERNEL_SPACE.exclusive_access().activate();
    // v3: KERNEL_SPACE.lock().activate();
}
```

我们最先进行全局动态内存分配器的初始化，接着初始化物理页帧管理器（内含堆数据结构 `Vec<T>` ）使能可用物理页帧的分配和回收能力。最后创建内核地址空间并让 CPU 开启分页模式， MMU 在地址转换时将使用内核的多级页表。

我们分析内核地址空间创建这一句。首先引用 `KERNEL_SPACE` ，由于是第一次被使用，此时它会被初始化，调用 `MemorySet::new_kernel` 创建一个内核地址空间并使用 `Arc<UPSafeCell<T>>` 包裹起来；

> 在 rcore-v3 文档中，内核地址空间被`Arc<Mutex<T>>`包裹，初始化时调用`KERNEL_SPACE.lock().activate()`.

```rust
impl PageTable{
    /// get the token from the page table
	pub fn token(&self) -> usize {
        8usize << 60 | self.root_ppn.0
    }
}
```

根据[实现 SV39 多级页表机制（上） — rCore-Tutorial-Book-v3 0.1 文档](https://rcore-os.gitcode.host/rCore-Tutorial-Book-v3/chapter4/3sv39-implementation-1.html#satp-layout)，当`satp`的`MODE`字段设置为8时，SV39分页机制被启用。`PageTable::token`用于构造`satp`开启分页模式，并填充多级页表根节点所在的物理页号。

```rust
impl MemorySet{
	/// Change page table by writing satp CSR Register.
    pub fn activate(&self) {
        let satp = self.page_table.token();
        unsafe {
            satp::write(satp);
            asm!("sfence.vma");
            // v3: llvm_asm!("sfence.vma" :::: "volatile");
        }
    }
}
```

`activate`将得到的`token`作为`satp`写入。`sfence.vma`包含清空快表TLB的操作。

注意，切换satp的指令附近的映射必须连续性，切换 satp 的指令及其下一条指令这两条相邻的指令的虚拟地址是相邻的。此处，这条写入 satp 的指令及其下一条指令都在内核内存布局的代码段中，在切换之后是一个恒等映射， 而在切换之前是视为物理地址直接取指，也可以将其看成一个恒等映射。这完全符合我们的期待：即使切换了地址空间，指令仍应该能够被**连续**的执行。

此外，我们可用`mm::remap_test`函数检查`mm:init`之后内核地址空间的多级页表是否被正确设置，分别通过手动查内核多级页表的方式验证代码段和只读数据段不允许被写入，同时不允许从数据段上取指。

#### 跳板Trampoline

在启用分页机制后，对于Trap处理时我们需要修改satp以完成应用/内核地址空间的切换。地址空间的切换不能影响指令的连续执行，即要求应用和内核地址空间在切换地址空间指令附近是平滑的。

> Q：为什么将 <u>**Trap 上下文**</u>放到应用地址空间的**次高页面**而不是内核地址空间中的内核栈中呢？
>
> A：为了在内核栈中保存上下文，需要以下步骤：
>
> - 切换到内核地址空间
>   - 将内核地址空间的 token 写入 `satp` 寄存器（切换页表）。
> - 定位内核栈顶
>   - 需要一个通用寄存器保存内核栈的栈顶指针。
>
> 但硬件只提供了一个 `sscratch` 寄存器作为临时寄存器，无法同时保存两个信息。这会导致寄存器冲突。因此，我们在应用地址空间的次高页面预留一个虚拟页面，专门用于保存 Trap 上下文。当 Trap 发生时：
>
> - 硬件直接使用当前地址空间（即应用的页表）定位上下文保存位置。
> - 无需切换到内核地址空间，也无需额外的寄存器来保存内核栈信息。

此处，上下文新添加的内容在初始化之后，只会被读取而不会被写入 ，无需每次都保存或恢复。在应用初始化时由内核写入应用地址空间中的 TrapContext 的相应位置，此后就不再被修改。

在 Trap 上下文中包含更多内容：

```rust
// os/src/trap/context.rs
#[repr(C)]
#[derive(Debug)]
/// trap context structure containing sstatus, sepc and registers
pub struct TrapContext {
    /// General-Purpose Register x0-31
    pub x: [usize; 32],
    /// Supervisor Status Register
    pub sstatus: Sstatus,
    /// Supervisor Exception Program Counter
    pub sepc: usize,
    /// *Token of kernel address space
    pub kernel_satp: usize,
    /// *Kernel stack pointer of the current application
    pub kernel_sp: usize,
    /// *Virtual address of trap handler entry point in kernel
    pub trap_handler: usize,
}
```

> 文档重新介绍了`trap.S`与`linker.ld`，增加了跳板，大体上没有改变。

将 `trap.S` 中的整段汇编代码放置在 `.text.trampoline` 段，并在调整内存布局的时候将它对齐到代码段的一个页面中：

```
# os/src/linker.ld

    stext = .;
    .text : {
        *(.text.entry)
+        . = ALIGN(4K);
+        strampoline = .;
+        *(.text.trampoline);
+        . = ALIGN(4K);
        *(.text .text.*)
    }
```

由此，汇编代码被放在内核和应用地址空间的最高虚拟页面上，并且内核和应用代码都只能看到各自的虚拟地址空间。由于这段汇编代码在执行**地址空间切换**，故而被称为**跳板**页面。

由于无论是内核还是应用的地址空间，跳板的虚拟页均位于同样位置，且在执行 `__alltraps` 或 `__restore` 函数进行地址空间切换的时，切换地址空间指令所在页的映射方式均相同，故切换地址空间的指令控制流是可以连续执行的。

`map_trampoline`调用`self.page_table.map()`构建虚实地址映射。

> 在`trap.S`需要使用`jr trap_hander`而不能继续使用`call`，这里的理解遇到了一些困难，之后补充。

#### 加载和执行应用程序

首先需要更新`TaskControlBlock`模块，`TaskControlBlock::new()`解析传入的 ELF 格式数据构造应用的地址空间 `memory_set` 并获得其他信息.

在内核初始化时，将所有的应用加载到全局应用管理器中：

```rust
# os/src/task/mod.rs
lazy_static! {
    /// a `TaskManager` global instance through lazy_static!
    pub static ref TASK_MANAGER: TaskManager = {
        println!("init TASK_MANAGER");
        let num_app = get_num_app();
        println!("num_app = {}", num_app);
        let mut tasks: Vec<TaskControlBlock> = Vec::new();
        for i in 0..num_app {
            tasks.push(TaskControlBlock::new(get_app_data(i), i));
        }
        TaskManager {
            num_app,
            inner: unsafe {
                UPSafeCell::new(TaskManagerInner {
                    tasks,
                    current_task: 0,
                })
            },
        }
    };
}
```

#### 改进trap_hander

```rust
// os/src/trap/mod.rs
#[no_mangle]
pub fn trap_handler() -> ! {
    set_kernel_trap_entry();
    let cx = current_trap_cx();
    let scause = scause::read(); // get trap cause
    let stval = stval::read(); // get extra value
    // trace!("into {:?}", scause.cause());
    match scause.cause() {
    // ...
    }    
    trap_return();
```

`cx`不能作为参数直接传入，需要获取当前应用 Trap 上下文的可变引用。

而对于其中的`set_kernel_trap_entry`，

```rust
// os/src/trap/mod.rs
fn set_kernel_trap_entry() {
    unsafe {
        stvec::write(trap_from_kernel as usize, TrapMode::Direct);
    }
}
```

会将 `stvec` 修改为函数 `trap_from_kernel` 的地址。即为，进入内核后再次触发到 S 的 Trap，则会在硬件设置一些 CSR 之后，跳过寄存器的保存过程，跳转到 `trap_from_kernel` 函数（直接 `panic` 退出）.

之后再`trap_return`返回用户态，

```rust
// os/src/trap/mod.rs
pub fn trap_return() -> ! {
    set_user_trap_entry();
    let trap_cx_ptr = TRAP_CONTEXT_BASE;
    let user_satp = current_user_token();
    extern "C" {
        fn __alltraps();
        fn __restore();
    }
    let restore_va = __restore as usize - __alltraps as usize + TRAMPOLINE;
    // trace!("[kernel] trap_return: ..before return");
    unsafe {
        asm!(
            "fence.i",
            "jr {restore_va}",         // jump to new addr of __restore asm function
            restore_va = in(reg) restore_va,
            in("a0") trap_cx_ptr,      // a0 = virt addr of Trap Context
            in("a1") user_satp,        // a1 = phy addr of usr page table
            options(noreturn)
        );
    }
}
```

启用分页模式之后，我们只能通过跳板页面上的虚拟地址来实际取得 ``__alltraps`` 和 ``__restore`` 的汇编代码。

具体而言，我们需要跳转到 ``__restore`` 切换到应用地址空间，并从 Trap 上下文中恢复通用寄存器，并 ``sret`` 继续执行应用。

首先需要找到 ``__restore`` 在内核/应用地址空间中共同的虚拟地址。由于 ``__alltraps`` 是对齐到地址空间跳板页面的起始地址 ``TRAMPOLINE`` 上的， 则 ``__restore`` 的虚拟地址只需在 ``TRAMPOLINE`` 基础上加上 ``__restore`` 相对于 ``__alltraps`` 的偏移量即可。这里 ``__alltraps`` 和 ``__restore`` 都是指编译器在链接时看到的内核内存布局中的地址。我们使用 ``jr`` 指令完成了跳转的任务。

 ``__restore`` 需要两个参数，分别是 Trap 上下文在应用地址空间中的虚拟地址，和要继续执行的应用地址空间的 token. 
 
> 如何知道需要两个参数？
> 在汇编代码中，``__restore`` 函数使用了两个寄存器参数 ``a0`` 和 ``a1``。``a0`` 是用户空间的 TrapContext 指针。``a1`` 是用户空间页表的物理地址。 
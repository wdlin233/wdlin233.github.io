---
author: wdlin
pubDatetime: 2026-02-17T12:00:00
modDatetime: 2026-02-18T13:00:00
title: GPUMODE Lec.8
slug: gpumode-lec8
featured: false
draft: false
tags:
  - MLSys
  - CUDA
description:
  Lecture 8: CUDA Performance Checklist
---

对于 CUDA Kernel，主要有以下几个指标：
- DRAM Throughput
- Duration
- L1 Cache Throughput

其中 DRAM Throughput 和 Duration 是比较关键的两个因素.

然后开始讲解 examples.

首先提及的是内存合并的问题，使用 Coalesced Access 获得了更低的 DRAM Throughput，而 L1 Cache Throughput 提升了，Duration 降低.

将 Block Size 从 128 改为 1024，获得了 Occupancy 从 77% 到 86% 的提升.

由此一个很自然的问题是，我该如何调整这些参数，诸如 Grid size 来达到更高的 Occupancy？

存在两种典型的因为 poor occupancy 所导致的问题：
- Tile Quantization: martix dimensions are not divisible by the thread block tile size.
- Wave Quantization: total number of tiles is not divisible by number of SM on GPU

此处举的一个例子是，对于 m * k 和 k * n 的矩阵乘，设定 m 和 n 固定为 1024，当 inner dimension k 为 1016 时 duration 仅为平时的 1/2. 

[英伟达官方文档](https://docs.nvidia.com/deeplearning/performance/dl-performance-matrix-multiplication/index.html) 列出了一些 requirement 来说明如何更好利用 Tensor Core 的特性，见于 Table 1. 所以这就是 PyTorch 中 padding 的原因.

对于 CUDA Kernel 来说，change kernel launch parameters 是类似的方法.

CUDA occupancy calculator解决了这个问题，使用 `cudaOccupancyMaxPotential BlockSize` 这个 kernel 来找出最佳的 kernel launch parameters. 返回 Recommended block size 和 Minimum grid size.

***

可以看到 ncu WRN: Memory is more heavily utilized than Compute. 此处讲解了 Roofline model. 

同时我们需要理解 Arithmetic intensity (AI) 究竟如何计算而得，Back of the envelope 简单计算一下：

例如 对于 vector ReLU f(x) = max(0, x). Assuming untilize FP32, for each element 1 read, 1 comparison op and maybe 1 write. Total bytes is 2 × (32 bits / 8) = 8 and ops is 1. So arithmetic intensity in the worst case is ⅛. 

When every element in x is greater than zero, only 1 comparison op and 1 read exist. The AI is ¼. 英伟达的官方文档列出 0.25 时，其实展示了某种意义上的最佳情况. 

Quantization 的作用就在于加强了 Arithmetic intensity. 任何计算强度低于 1 的情况，其实都严重受限于内存带宽.

对于 Matmul 的情况，A 为 M, K 而 B 为 K, N，最终浮点运算次数 FLOPS 为 M × N × 2K. 对于 Bytes 来说是 MK + KN (load each matrix) 和 MN (write to output)，加和得到 MK + KN + MN.

得到 AI = (2MNK) / (MK + KN + MN). 大部分情况下受限于计算，但是对于小矩阵来说，访存会是瓶颈. 

TL; DR. For Bandwidth Bound Kernel, Fusion is really matter as you need to do more work per kernel. And quantization and compilation are also significant. For Compute Bound Kernel you essentially need to write a better algorithm.

***

还有 Tiling of reused data 的讨论，这部分其实一直被讨论得很多，利用共享内存复用数据的方法. 

讲解 Minimize Thread Divergence 的问题，GPU 以 warp 单位执行，先执行完的一部分线程要等待其他执行较慢的线程的工作结束，这就是 Thread Divergence 带来的影响. 

这里用了一种很巧妙的写法，with divergence 的 kernel 是：

```cpp
if (idx < N) {
    if (data[idx] % 2 == 0) {
        data[idx] = data[idx] * 2;
    } else {
        data[idx] = data[idx] + 1;
    }
}
```

without divergence 的写法是：

```cpp
if (idx < N) {
    int isEven = !(data[idx] % 2);
    data[idx] = isEven * (data[idx] * 2) + (!isEven) * (data[idx] + 1);
}
```

如果直接使用 ncu 很难从基础指标中看出 divergence 的影响，需要使用 `ncu --set full <outputfile>`. 关注 Branch Instructions, Branch Efficiency and Avg. Divergent Branches (Source Counters) 这几个指标. 效果也很显著 that is really one of the most important optimizations.

还谈及了线程协作 Thread Coarsening. 我理解的是这是向量化的另一种表现方法. 此处举例加速了 10 倍：

```cpp
int i = blockIdx.x * blockDim.x + threadIdx.x;
if (i < N)
    C[i] = A[i] + B[i]; 
```

改写为

```cpp
int i = (blockIdx.x * blockDim.x + threadIdx.x) * 2;
if (i < N)
    C[i] = A[i] + B[i]; 
if (i + 1 < N)
    C[i + 1] = A[i + 1] + B[i + 1];
```

We call this coarsening factor of 2. DRAM throughput 从 0.81% 到 1.10%. 反常的表现可能是因为数据量足够小导致整个数据集可以放在共享内存中.

Another example of not using global memory as much is the idea called privatization: apply partial updates to private copy of data before writing back to global or shared memory.

一个典型的例子就是滑动窗口 sliding window algorithm. 可以让注意力机制的实现基本上实现更接近 local operation. 文章 Mistral 7B 对此有更多讨论. 对于 auto regressive decoding 通常会有一个 mask，采用滑动窗口不用计算整个 QKV 序列. 

privatization 可以得到 higher occupancy, higher compute SM throughput and lower DRAM throughput. 此处的例子演示了在 shared memory 上进行操作，最后写回 global memory. 不要直接在 global memory 上进行操作. 其思想和 Tiling 是接近的.

后面讨论了 softmax 问题，主要是根据提及的这篇文章. softmax 包含 3 memory accesses，也即计算一次归一化因子和一次指数——2 reads. Single output 作为 1 store. 而 Pytorch 等框架实现的 safe softmax 包含 4 memory accesses. online softmax 使用一种数学上的等价来回到 3 memory accesses. 具体内容看文章可能更合适. 阅读这篇文章也有助于理解 flash attn. 

结尾建议阅读 PMPP Table 6.1. 尝试建立一些对于优化的直觉并尝试使用 ncu 验证它. 
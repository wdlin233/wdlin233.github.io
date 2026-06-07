---
author: wdlin
pubDatetime: 2026-05-03T12:00:00
modDatetime: 2026-06-07T13:00:00
title: Intro to Polyhedral Optimization
slug: polyhedral
featured: false
draft: true
tags:
  - PL
  - compiler
description: "Notes for Polyhedral Optimization"
---

## 入门

**仿射函数**的概念：半空间 $\{x∈R^n∣a^⊤x≤b\}$ 理解为不等式约束选取点在超平面的一侧，$f(x)=a^⊤x$ 为线性函数，$f(x) = a^⊤x + b$ 为仿射函数，这里 $⊤$ 就是转置 $T$.

多面体的一个直觉就是，我们可以把程序的一些循环约束使用一些约束方程来表示，具体策略是线性代数、矩阵，这些约束方程在多维坐标系的空间中表示为几何体，约束条件组成的几何体称为**多面体**。在多面体上寻找一个最优的点，这被称为**凸优化**。

比如现在我有一个循环，

```cpp
for (i = 0; i < N; i++)
  for (j = 0; j < M; j++)
    Z[i - 1] = ...
```

一次具体的迭代我可以使用一个向量 $\boldsymbol{x} = \begin{bmatrix} i \\ j \end{bmatrix}$ 而对于数组访问 `Z[i - 1]` 就可以写成

$$\begin{bmatrix} 1 & 0 \end{bmatrix} \begin{bmatrix} i \\ j \end{bmatrix} + \begin{bmatrix} -1 \end{bmatrix} =i - 1$$

数组访问的每一维下标都是循环变量和参数的仿射表达式，可以抽象为一个**仿射表达式**：

数组下标 = 系数矩阵 * 循环迭代向量 + 常数偏移

扩展阅读：
- [OpenScop](https://icps.u-strasbg.fr/~bastoul/development/openscop/docs/openscop.html)
- [MLIR 'affine' Dialect](https://mlir.llvm.org/docs/Dialects/Affine/)

然后判断两个访问是否可能指向同一元素，令两个数组下标相等，可以得到一组线性等式，求解消除偏移量后的 $Fv=0$ 的关于 $F$ 的零空间，如果无解那么两次访问不可能到同一个位置，不存在数据依赖；如果有解，根据 RAW, WAR, WAW 场景评断依赖类型。如果依赖发生在同一轮迭代内部是 loop-independent dependence，如果发生在不同迭代轮次之间则是 loop-carried dependence，编译器主要关心后者因为这决定了循环的并行化。

在多面体模型里，循环的一次执行，也就是 **statement instance**，通常被看作整数多面体里的一个点；循环边界形成这个多面体的约束，数组访问和调度都可以用仿射函数描述。 

编译器先假设有一些虚拟处理器排成某种形状 (**processor space**)，将循环迭代点分配到这些位置上，可以说用仿射函数将迭代空间里的点分配给处理器。将从循环迭代到虚拟处理器的映射写成从 tile 或 iteration space 到 processor space 的仿射函数。比如[一些文献](https://fileserver-az.core.ac.uk/download/618230194.pdf)会写成：

$$\phi(k) : K \rightarrow P$$

其中 $\phi$ 是 allocation matrix. 简单来说，这些都是 循环迭代坐标 ↦ 处理器坐标。对于仿射划分，一般矩阵的秩越大那么可能的并行度就越高，但是通信也有可能会更多。

一个很自然的疑问是，既然处理器坐标不是真实的CPU核，虚拟处理器最后是怎么和实际执行运算的单元联系在一起的？先前讨论的问题都是，数学上这个部分应该分配给谁，在实际执行时，会归到 OpenMP 线程、CUDA block/thread、MPI rank 或者一个 task 这类**运行时**的层级。大概是这样的：

循环迭代点→虚拟处理器坐标→线程/任务/块→真实硬件执行单元

因为真实的机器的核数和迭代点的数目是相当不匹配的，在实际操作中一般会进行分块，例如：

$$p_1 = \lfloor \frac{i}{T_i} \rfloor, p_2 = \lfloor \frac{j}{T_j} \rfloor$$

这样 $(p1, p2)$ 就表示为一个 tile 表示一小块迭代区域。然后再把二维坐标压缩为一维的任务 $task_id = p_1 \cdot P_2 + p_2$.

回到 processor space 的问题，能并行的迭代我们要分给不同的处理器提升并行性，而有数据依赖或者数据复用的迭代应该尽量放在同一个处理器里减少通信和同步的开销。于是我么可以写出如下约束（数据依赖约束、处理器分配约束、循环范围约束）：

$$F_1x_1+c_1 = F_2x_2+c_2$$
$$C_ix_1+c_1=C_2x_2+c_2$$
$$Bi+b \ge 0$$

这些约束就构成了多面体，求解它就是求解一个合法的、无冲突的、并行友好的调度。因为约束是线性的，所以可以使用单纯形法等来求解，但并不是所有的 polyhedral 问题都可以通过单纯形法来解决，求解的结果可能不是合法循环/处理器映射，实际系统可能需要使用 ILP, PIP 或者专门的 polyhedral 库等实现。

所以，多面体编译的问题可以归纳为这么一个问题：已知哪些循环迭代可以安全并行之后，如何把这些迭代映射到处理器空间，并尽量减少通信、同步和数据搬运？我们可以把它的策略分成两个部分，一个是空间划分 processor allocation $p = Cx + c$ 来决定每个迭代点在哪个处理器上执行，另一个是时间调度 scheduling $t = Tx + t_0$ 决定每个迭代点什么时候执行。两者合起来是

$$\begin{pmatrix} p \\ t \end{pmatrix} = \Theta x + \theta$$

称为 space-time mapping. 也有资料把空间映射称为迭代点分配到 processor index，而时间映射称为 schedule vector.

## SCoP

Static Control Part.

指的是程序中一段可以被多面体模型准确表示和优化的代码区域。具体而言就是控制流图中的一个控制流静态已知的子区域。

SCoP 的作用是找到可以写成仿射表达式、仿射边界比较明确的代码部分。

## FPL

[FPL](https://grosser.science/FPL/) 是一个比 isl 更好的 Presburger library，现在是 MLIR 的一部分。

## sl3.sy

[有人说](https://www.zhihu.com/question/302053357/answer/1312223034)，模板 (Stencil) 指的是指定计算区域中的每个位置都执行相同计算操作；不过根据 GPT 的解释，是用一个网格点附近固定形状的一组邻居，来计算某个点的新值，而这个固定形状的周围的数值点就是 stencil 可以称为模板、领域模板或者差分模板。

有如下几种：
- Jacobi-stencil: 读取旧数组的邻居，写新数组，容易并行
- Stagger-stencil: 一个点向多个输出点贡献，容易有写冲突
- Sweep-stencil: 读写同一个 (in-place) 数组，更新沿着某个方向传播，需要按照依赖顺序或者 wavefront，这种更新风格似乎也称为 Gauss-Seidel.

比如 sl3.sy 的这个，

```c
x[i][j][k] =  ( 
	x[i-1][j][k] + x[i+1][j][k] + 
	x[i][j-1][k] + x[i][j+1][k] + 
	x[i][j][k-1] + x[i][j][k+1] + 
	x[i-1][j-1][k -1]
) / f;
```

会因为 stencil 循环依赖问题导致无法并行化，比如

$$S_1(i-1,j,k) \rightarrow S_1(i,j,k)$$

有来自 $(1,0,0)$ 方向的 RAW 依赖，同理还有 $(0,1,0)$, $(0,0,1)$, $(1,1,1)$.

而对于 `x[i+1][j][k]` 的情况，还会有 WAR:

$$S_1(i,j,k) \rightarrow S_1(i+1,j,k)$$

方向是 $(1,0,0)$，同理还有 $(0,1,0)$, $(0,0,1)$. 所以不能直接 collapse(3) 并行。

对于每条依赖的 $u \rightarrow v$，schedule 必须满足 $\Theta(u) <_{lex} \Theta(v)$，源点必须排在目标点之前。原 schedule $\Theta(i, j, k) = (i, j, k)$ 可以考虑写成 

$$\Theta(i, j, k) = (i + j + k, i, j, k)$$

第一个维度为 wavefront 时间，wavefront parallelism 可以理解为计算点依赖邻居 (stencil) 形成对角线依赖的 waves，各个 waves 内部可以并行，waves 之间按顺序推进。

比如对于一个 sweep-stencil，`a[i][j] = a[i-1][j] + a[i][j-1]` 就在 $i+j=C$ 上构成 waves，因为 waves 内部的计算点不构成依赖，所以是可以并行的。所以对于这么一段原始程序：

```cpp
for (i = 1; i < N; i++)
  for (j = 1; j < N; j++)
    a[i][j] = a[i-1][j] + a[i][j-1];
```

使用 wavefront 就是：

```cpp
for (int t = 2; t <= 2 * (N - 1); t++) {
  #pragma omp parallel for
  for (int i = 1; i < N; i++) {
    int j = t - i;
    if (1 <= j && j < N) {
      a[i][j] = a[i-1][j] + a[i][j-1];
    }
  }
}
```

按 `t` 逐波推进。

我的理解是，一般的 parallelism 是让所有点同时执行，但是我们存在 sweep-stencil 这些依赖，于是我们发现可以使用 Presburger 代数证明在 affine expressions 上可以通过构造一个变换来得到 wavefront，得到 waves 批次之间是顺序的，但是  waves 内部是并行的。

我们还可以做 tile 级的 wavefront，先把空间切成 tiles 之后按 tile 的 `i+j+k` (sl3.sy) 做 wavefront。这样在保证依赖的同时还可以改善 cache 局部性。

[PLUTO](https://pluto-compiler.sourceforge.net/) 这类多面体优化器的思想就是为 affine loop nest 寻找仿射变换，同时优化粗粒度并行和数据局部性，生成 OpenMP 等并行代码。

参考资料：
- [Hybrid Static/Dynamic Schedules for Tiled Polyhedral Programs](https://arxiv.org/abs/1610.07236)
- [Efficient Temporal Blocking for Stencil Computations by Multicore-Aware Wavefront Parallelization](https://www.researchgate.net/publication/221028615_Efficient_Temporal_Blocking_for_Stencil_Computations_by_Multicore-Aware_Wavefront_Parallelization)

回到 sl3.sy 这个测例本身，对于

$$(i, j, k) \rightarrow (i+1, j, k)$$

有

$$t' = (i+1) + j + k = t + 1$$

所以这是一个非常适合 wavefront 的场景，目标点就在下一个 wave.

对于

$$(i, j, k) \rightarrow (i+1, j+1, k+1)$$

得到 $t' = t + 3$. 但所有依赖都是从小 $t$ 到大 $t$，所以这是一个合法的 wavefront schedule.

总结，整个流程大约是，首先构造 domain

$$D_1 = {(i, j, k) | 1 \leq i \lt N -1, 1 \leq j\lt N-1, 1 \leq k \lt N-1}$$

然后构造 access maps 并求解 dependence relation

$$W(i, j, k) = (i, j, k)$$
$$R_1(i, j, k) = (i-1,j,k), R_2 = (i,j,k)=(i+1, j, k)$$

求解

$$W(i_1, j_1, k_1) = R(i_2, j_2, k_2)$$

并且 $(i_1, j_1, k_1)$ 在原 schedule 中先于 $(i_2, j_2, k_2)$. 这一部分可以交给 isl 来求解。

然后设定待求 schedule

$$\Theta(i,j,k)=ai+bj+ck$$

满足所有依赖方向 $d$ 的合法性 $\Theta(d)>0$, 对于 stencil:

$$d_1=(1,0,0) \rightarrow a>0$$
$$d_2=(0,1,0) \rightarrow b>0$$
$$d_3=(0,0,1) \rightarrow c>0$$
$$d_4=(1,1,1) \rightarrow a+b+c>0$$

取最简单整数解 $a=b=c=1$ 得到

$$\Theta(i,j,k) = i+j+k$$

即 wavefront, 然后生成对应代码即可。给定 schedule 之后 Generator 按照 schedule 字典序访问 domain 的循环。isl 的 AST generator 可以根据 schedule map 生成访问 domain 中所有点的 AST。

## Schedule

多面体里的 schedule 本质就是给每个 statement instance 一个执行时间或者说执行顺序，从英文本身来看意思就是调度，简单来说就是我要怎么执行这些计算。

比如对于 $S(i,j,k)$ 其源程序顺序是

$$\Theta(i,j,k)=(i,j,k)$$

表示按 $i$, $j$ 再 $k$ 的字典序执行。对于所有依赖 $u \rightarrow v$ 满足 $\Theta(u) <_{lex} \Theta(v)$.

Pluto 这类多面体优化器就是寻找 仿射变换来优化 并行性、tiling 和局部性 (finding good ways of tiling for parallelism and locality using affine transformations)。

但是没有运行时的支持这让 wavefront 的策略很难有收益，考虑 stencil carry / reload / affine scalar replacement.

不过调研了一番，最后做的是：
1. 对于 sl3.sy 的 future-neighbor 做常量化的折叠
2. storage contraction 也证明在多面体上有帮助，也就是 schedule 和 storage 联合求解

Presburger 可以证明没有任何先前的 stencil 可以写达到这个 read, 通过

$$(i+1,j,k)\nless_{lex}(i,j,k)$$

并且初始化确实覆盖了地址

$$(i+1, j, k) \in D_0$$

所以 stencil 中没有更早写入的，同时初始化确实覆盖，那么

$$x[i+1][j][k]=1$$

在当前 read 处恒成立。于是我们可以将其折叠为常量 1，或许可以认为这是一个特化版的 Presburger 求解器。

关于 two-plane storage contraction 是将 `x[i][j][k]` 映射到 `xbuf[i % 2][j][k]`. 做常量化后，

```cpp
x[i][j][k] =
  (x[i-1][j][k] +
   x[i][j-1][k] +
   x[i][j][k-1] +
   x[i-1][j-1][k-1] +
   3) / f;
```

那么只存在 4 个依赖，`i-1` (上一个 i 平面), `j-1` (当前 i 平面的上一行), `k-1` (当前 i 平面当前行的上一个 k) 和 `[i-1][j-1][k-1]` (上一个 i 平面)，所以我们可以使用一个类似于滑动窗口的思想做一个 rolling plane 只保存最近两层，旧的一层用完就被覆盖。于是差不多就是：

```c
int prev = (i - 1) & 1;  
int cur = i & 1;
```

那么常驻的数据量就能减少很多。





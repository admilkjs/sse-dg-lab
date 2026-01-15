# Changelog

## [1.4.0](https://github.com/admilkjs/sse-dg-lab/compare/v1.3.0...v1.4.0) (2026-01-15)


### ✨ 新功能

* APP断开重连机制修复与持续播放测试完善 ([de8b755](https://github.com/admilkjs/sse-dg-lab/commit/de8b7556c1997adc49c4f7689611271fecc37c41))
* **session-manager:** 添加别名唯一性验证和重连状态管理 ([e9c51a0](https://github.com/admilkjs/sse-dg-lab/commit/e9c51a0c8344e5ba54ed52c27033a1b998bcfe70))


### 🐛 错误修复

* APP断开时不触发onBindChange，保留boundToApp状态 ([3ab903e](https://github.com/admilkjs/sse-dg-lab/commit/3ab903ed11cf0b5b93b63edf0b02f02cbb3f2d1b))
* APP重连时调用handleReconnection恢复会话状态 ([981c3a2](https://github.com/admilkjs/sse-dg-lab/commit/981c3a2c7e6d2bf56feffbc7575a5a760e0b73b7))
* 改下说明 ([97d03ba](https://github.com/admilkjs/sse-dg-lab/commit/97d03bac27468c441b6d2e9ec13a21eb2618db58))


### 📝 文档更新

* 更新文档 ([b26c863](https://github.com/admilkjs/sse-dg-lab/commit/b26c863a33993ec1d0fbe878acd05425ce912e7a))
* 错字 ([31c3745](https://github.com/admilkjs/sse-dg-lab/commit/31c3745e6945aad302e460d0ea34f3fd9aab7711))

## [1.3.0](https://github.com/admilkjs/sse-dg-lab/compare/v1.2.1...v1.3.0) (2026-01-15)


### ✨ 新功能

* **logger:** 增强日志模块，添加日志级别和 logger 对象 ([1109320](https://github.com/admilkjs/sse-dg-lab/commit/110932036dd2a9d8dae1508eee0737b047dde4e1))


### 🐛 错误修复

* CLI 入口默认使用 stdio 模式 ([f9136a4](https://github.com/admilkjs/sse-dg-lab/commit/f9136a41429f7deeff54df90c2d01a45cfd03a2a))


### ♻️ 代码重构

* 简化 logger 模块 ([61713b1](https://github.com/admilkjs/sse-dg-lab/commit/61713b19d1576434790cc638ccdd6d953befa43e))

## [1.2.1](https://github.com/admilkjs/sse-dg-lab/compare/v1.2.0...v1.2.1) (2026-01-15)


### 🔧 其他更新

* skip version 1.2.0 (previously unpublished) ([c207453](https://github.com/admilkjs/sse-dg-lab/commit/c207453f5e1e02744f45ddcef514b3d0af9f73e7))

## [1.2.0](https://github.com/admilkjs/sse-dg-lab/compare/v1.1.0...v1.2.0) (2026-01-15)


### ✨ 新功能

* 启动日志显示版本号 ([9a8a6d7](https://github.com/admilkjs/sse-dg-lab/commit/9a8a6d7b8900ed0cc68a218374903a1a676de1be))


### 🐛 错误修复

* stdio 模式下将日志重定向到 stderr ([883ee63](https://github.com/admilkjs/sse-dg-lab/commit/883ee63f86e16f2fdb05ad8110fd777bf1d1bc82))
* stdio 模式下更早启用日志重定向 ([d788dd7](https://github.com/admilkjs/sse-dg-lab/commit/d788dd7edfad6a5e4fa1e6c6cc5a1e47e4e21c4b))

## [1.1.0](https://github.com/admilkjs/sse-dg-lab/compare/v1.0.0...v1.1.0) (2026-01-15)


### ✨ 新功能

* Postman style test page with dynamic tool list ([2865135](https://github.com/admilkjs/sse-dg-lab/commit/2865135c24c3f0436c4f56167312b29f57c82dce))
* **waveform-parser:** 修复波形解析器 ([ca75d6d](https://github.com/admilkjs/sse-dg-lab/commit/ca75d6d127e0e6d512870b9af38efe2727faa9f0))
* 优化波形工具、修复持续播放时序和控制器断开重连 ([801e439](https://github.com/admilkjs/sse-dg-lab/commit/801e439d1298eca5a1ff5475141e9757d5a35edd))
* 支持更多mcp协议，完善调用 ([d23c2b2](https://github.com/admilkjs/sse-dg-lab/commit/d23c2b20fe96ea298330002a6b49d7e41b774695))
* 添加 npm publish 和 npx 支持 ([ebf6378](https://github.com/admilkjs/sse-dg-lab/commit/ebf6378007704b936d600128a90469c88afd5908))
* 添加设备重连超时功能并移除 ws-bridge 模块 ([026f788](https://github.com/admilkjs/sse-dg-lab/commit/026f788ce840976c6a029b7bc3614cd67b98d3e8))


### 🐛 错误修复

* exit ([826cdab](https://github.com/admilkjs/sse-dg-lab/commit/826cdab141b40b341460d44e3bbaeacd1fbc04e7))
* stdio 模式下独立启动 WebSocket 服务器 ([a22e6ef](https://github.com/admilkjs/sse-dg-lab/commit/a22e6eff7a22013571a85a7e75d2573f2a10f46c))
* waves ([66c2656](https://github.com/admilkjs/sse-dg-lab/commit/66c2656b7d64bca81d59bddbd418012e9d884405))
* 修复 npm 自动发布工作流 ([6d1dcd5](https://github.com/admilkjs/sse-dg-lab/commit/6d1dcd5840cabc82291cc0fe9ec0ea1504571031))
* 升级 Node.js 到 24.x 以支持 npm OIDC 可信发布 ([e164a68](https://github.com/admilkjs/sse-dg-lab/commit/e164a681aaaa9d0062c962c2fb4735738ba93a34))
* 暂时移除工作流中的 typecheck 步骤 ([dab92d3](https://github.com/admilkjs/sse-dg-lab/commit/dab92d377e13aafff86167e5833939b43c488f7d))
* 添加 ESLint 9 配置文件 ([7301621](https://github.com/admilkjs/sse-dg-lab/commit/73016213881febeaf48b36f7ad9e2345d96ad0d5))
* 移除工作流中的 working-directory 配置 ([21e4ae1](https://github.com/admilkjs/sse-dg-lab/commit/21e4ae18a43fc9576e0eaa7443981043948ad723))


### 📝 文档更新

* 添加 DG-LAB 开源协议声明 ([dc3d610](https://github.com/admilkjs/sse-dg-lab/commit/dc3d6104a4d333254dddac2cdc6ffc09eabfff20))
* 添加 v1.0.0 发布说明 ([0337a49](https://github.com/admilkjs/sse-dg-lab/commit/0337a490720e4bec405aee73fab86398fb577381))


### 🔧 其他更新

* release 1.1.0 ([3262095](https://github.com/admilkjs/sse-dg-lab/commit/3262095da0a7558f6ea9807884bf603743b5c274))
* release 1.1.0 ([8f14ad6](https://github.com/admilkjs/sse-dg-lab/commit/8f14ad62a3213f5fbd5c09ae1f1a86efcb6eb692))
* release 1.1.0 ([3c12d8d](https://github.com/admilkjs/sse-dg-lab/commit/3c12d8d74439d1037ca047bf16e72f36cf492619))
* release 1.1.0 ([84f7497](https://github.com/admilkjs/sse-dg-lab/commit/84f7497673e90f781705e4695960f7eb316624d9))
* release 1.1.0 ([3645b53](https://github.com/admilkjs/sse-dg-lab/commit/3645b534369f506ab318ccf99e29cfa1677685d8))
* release 1.1.0 ([fcf18fb](https://github.com/admilkjs/sse-dg-lab/commit/fcf18fba677d7126e9b3a0646e39876263808992))
* release 1.1.1 ([22b9e3d](https://github.com/admilkjs/sse-dg-lab/commit/22b9e3d518c1f6fd0934755fbffca47c586bf5fb))
* release 1.1.1 ([1db74a7](https://github.com/admilkjs/sse-dg-lab/commit/1db74a7436278fac93bfaed17f322c50e36b357a))
* release 1.1.1 ([37e4dc0](https://github.com/admilkjs/sse-dg-lab/commit/37e4dc0112b7f4d759b53b9996b46d7ef978aaf7))
* release 1.1.1 ([0e2ec37](https://github.com/admilkjs/sse-dg-lab/commit/0e2ec3717c13ff1cc410f80899b727ddd74bf0cf))
* release 1.1.2 ([5249305](https://github.com/admilkjs/sse-dg-lab/commit/524930522c78dd6c3129df11362291471e7d3885))
* release 1.1.2 ([838a72f](https://github.com/admilkjs/sse-dg-lab/commit/838a72f5467c703a9adc1069a8163fc8a623b160))
* release 1.1.3 ([7a38535](https://github.com/admilkjs/sse-dg-lab/commit/7a385358335dbc448d919b32d18c4a7040bc403a))
* release 1.1.3 ([0d45e8d](https://github.com/admilkjs/sse-dg-lab/commit/0d45e8daff43b66a61635065750f12275072e636))
* release 1.2.0 ([2d35777](https://github.com/admilkjs/sse-dg-lab/commit/2d35777c4eedec78ec50708886c6a374a6d0ca32))
* release 1.2.0 ([bcd8aec](https://github.com/admilkjs/sse-dg-lab/commit/bcd8aecda987583fff652b24640f30a07cfb93ff))
* release 1.2.0 ([e21469f](https://github.com/admilkjs/sse-dg-lab/commit/e21469f153ff0a307e81897148fc2670a3920056))
* release 1.2.0 ([7b3445d](https://github.com/admilkjs/sse-dg-lab/commit/7b3445d9968954cd9a0eab061df3899d724f062b))
* release 1.3.0 ([d4a38e4](https://github.com/admilkjs/sse-dg-lab/commit/d4a38e49109f6f9bea9f3d3c62312194d570a648))
* release 1.3.0 ([9a0ed42](https://github.com/admilkjs/sse-dg-lab/commit/9a0ed422fc5bb52943f0d8611f5c0d9d053dfc43))
* release 1.3.1 ([3945304](https://github.com/admilkjs/sse-dg-lab/commit/39453048c353b60477f77d184cd575bbbb413f99))
* release 1.3.1 ([f36d104](https://github.com/admilkjs/sse-dg-lab/commit/f36d10472f5e1ab60e576b2a87367c2a9d37c2d0))
* release 1.3.2 ([fc96068](https://github.com/admilkjs/sse-dg-lab/commit/fc960689d958a1723971ff4cbf00651168c4efd9))
* release 1.3.2 ([0c7828a](https://github.com/admilkjs/sse-dg-lab/commit/0c7828a80f7589c3c5214000e65dcbe854ef1b94))
* release trigger ([dd34c75](https://github.com/admilkjs/sse-dg-lab/commit/dd34c758077e0238d549564385c5b4c50e5eb32c))
* trigger release publish ([954b738](https://github.com/admilkjs/sse-dg-lab/commit/954b738b878bc0d809bd8ee02e3c0423b61f710a))
* trigger release publish ([5a93d97](https://github.com/admilkjs/sse-dg-lab/commit/5a93d975b17d368f0e28886d144a8ed5cd2a1950))
* trigger release publish ([b732338](https://github.com/admilkjs/sse-dg-lab/commit/b7323383ba6b79aa324fe96f293be4276a1e9d97))
* 发布 v1.0.1 ([1142689](https://github.com/admilkjs/sse-dg-lab/commit/114268953cbf1d55a002c752c6ff02e8dbc77e6e))


### ♻️ 代码重构

* convert all comments to TSDoc format with Chinese ([563569e](https://github.com/admilkjs/sse-dg-lab/commit/563569e08f948560cf0e8de842d23ddc0a582482))
* 重构应用架构，新增应用初始化模块 ([a62b208](https://github.com/admilkjs/sse-dg-lab/commit/a62b208e961b37245f57ab839bc2e26fd15860b3))


### 🎡 持续集成

* OIDC ([82f1d0e](https://github.com/admilkjs/sse-dg-lab/commit/82f1d0ef973d90ad3bb5378ff95112a4b550f50f))
* test ([1995cfb](https://github.com/admilkjs/sse-dg-lab/commit/1995cfbaa600f05fafb7eb31d617215f6e1721f2))
* 发布 ([d311b2d](https://github.com/admilkjs/sse-dg-lab/commit/d311b2d66cef78549219ff3649f2ef9c3ed3d4d9))

## [1.1.0](https://github.com/admilkjs/sse-dg-lab/compare/v1.0.0...v1.1.0) (2026-01-15)


### ✨ 新功能

* Postman style test page with dynamic tool list ([2865135](https://github.com/admilkjs/sse-dg-lab/commit/2865135c24c3f0436c4f56167312b29f57c82dce))
* **waveform-parser:** 修复波形解析器 ([ca75d6d](https://github.com/admilkjs/sse-dg-lab/commit/ca75d6d127e0e6d512870b9af38efe2727faa9f0))
* 优化波形工具、修复持续播放时序和控制器断开重连 ([801e439](https://github.com/admilkjs/sse-dg-lab/commit/801e439d1298eca5a1ff5475141e9757d5a35edd))
* 支持更多mcp协议，完善调用 ([d23c2b2](https://github.com/admilkjs/sse-dg-lab/commit/d23c2b20fe96ea298330002a6b49d7e41b774695))
* 添加 npm publish 和 npx 支持 ([ebf6378](https://github.com/admilkjs/sse-dg-lab/commit/ebf6378007704b936d600128a90469c88afd5908))
* 添加设备重连超时功能并移除 ws-bridge 模块 ([026f788](https://github.com/admilkjs/sse-dg-lab/commit/026f788ce840976c6a029b7bc3614cd67b98d3e8))


### 🐛 错误修复

* exit ([826cdab](https://github.com/admilkjs/sse-dg-lab/commit/826cdab141b40b341460d44e3bbaeacd1fbc04e7))
* waves ([66c2656](https://github.com/admilkjs/sse-dg-lab/commit/66c2656b7d64bca81d59bddbd418012e9d884405))
* 修复 npm 自动发布工作流 ([6d1dcd5](https://github.com/admilkjs/sse-dg-lab/commit/6d1dcd5840cabc82291cc0fe9ec0ea1504571031))
* 升级 Node.js 到 24.x 以支持 npm OIDC 可信发布 ([e164a68](https://github.com/admilkjs/sse-dg-lab/commit/e164a681aaaa9d0062c962c2fb4735738ba93a34))
* 暂时移除工作流中的 typecheck 步骤 ([dab92d3](https://github.com/admilkjs/sse-dg-lab/commit/dab92d377e13aafff86167e5833939b43c488f7d))
* 添加 ESLint 9 配置文件 ([7301621](https://github.com/admilkjs/sse-dg-lab/commit/73016213881febeaf48b36f7ad9e2345d96ad0d5))
* 移除工作流中的 working-directory 配置 ([21e4ae1](https://github.com/admilkjs/sse-dg-lab/commit/21e4ae18a43fc9576e0eaa7443981043948ad723))


### 📝 文档更新

* 添加 DG-LAB 开源协议声明 ([dc3d610](https://github.com/admilkjs/sse-dg-lab/commit/dc3d6104a4d333254dddac2cdc6ffc09eabfff20))
* 添加 v1.0.0 发布说明 ([0337a49](https://github.com/admilkjs/sse-dg-lab/commit/0337a490720e4bec405aee73fab86398fb577381))


### 🔧 其他更新

* release 1.1.0 ([3c12d8d](https://github.com/admilkjs/sse-dg-lab/commit/3c12d8d74439d1037ca047bf16e72f36cf492619))
* release 1.1.0 ([84f7497](https://github.com/admilkjs/sse-dg-lab/commit/84f7497673e90f781705e4695960f7eb316624d9))
* release 1.1.0 ([3645b53](https://github.com/admilkjs/sse-dg-lab/commit/3645b534369f506ab318ccf99e29cfa1677685d8))
* release 1.1.0 ([fcf18fb](https://github.com/admilkjs/sse-dg-lab/commit/fcf18fba677d7126e9b3a0646e39876263808992))
* release 1.1.1 ([22b9e3d](https://github.com/admilkjs/sse-dg-lab/commit/22b9e3d518c1f6fd0934755fbffca47c586bf5fb))
* release 1.1.1 ([1db74a7](https://github.com/admilkjs/sse-dg-lab/commit/1db74a7436278fac93bfaed17f322c50e36b357a))
* release 1.1.1 ([37e4dc0](https://github.com/admilkjs/sse-dg-lab/commit/37e4dc0112b7f4d759b53b9996b46d7ef978aaf7))
* release 1.1.1 ([0e2ec37](https://github.com/admilkjs/sse-dg-lab/commit/0e2ec3717c13ff1cc410f80899b727ddd74bf0cf))
* release 1.1.2 ([5249305](https://github.com/admilkjs/sse-dg-lab/commit/524930522c78dd6c3129df11362291471e7d3885))
* release 1.1.2 ([838a72f](https://github.com/admilkjs/sse-dg-lab/commit/838a72f5467c703a9adc1069a8163fc8a623b160))
* release 1.1.3 ([7a38535](https://github.com/admilkjs/sse-dg-lab/commit/7a385358335dbc448d919b32d18c4a7040bc403a))
* release 1.1.3 ([0d45e8d](https://github.com/admilkjs/sse-dg-lab/commit/0d45e8daff43b66a61635065750f12275072e636))
* release 1.2.0 ([2d35777](https://github.com/admilkjs/sse-dg-lab/commit/2d35777c4eedec78ec50708886c6a374a6d0ca32))
* release 1.2.0 ([bcd8aec](https://github.com/admilkjs/sse-dg-lab/commit/bcd8aecda987583fff652b24640f30a07cfb93ff))
* release 1.2.0 ([e21469f](https://github.com/admilkjs/sse-dg-lab/commit/e21469f153ff0a307e81897148fc2670a3920056))
* release 1.2.0 ([7b3445d](https://github.com/admilkjs/sse-dg-lab/commit/7b3445d9968954cd9a0eab061df3899d724f062b))
* release 1.3.0 ([d4a38e4](https://github.com/admilkjs/sse-dg-lab/commit/d4a38e49109f6f9bea9f3d3c62312194d570a648))
* release 1.3.0 ([9a0ed42](https://github.com/admilkjs/sse-dg-lab/commit/9a0ed422fc5bb52943f0d8611f5c0d9d053dfc43))
* release 1.3.1 ([3945304](https://github.com/admilkjs/sse-dg-lab/commit/39453048c353b60477f77d184cd575bbbb413f99))
* release 1.3.1 ([f36d104](https://github.com/admilkjs/sse-dg-lab/commit/f36d10472f5e1ab60e576b2a87367c2a9d37c2d0))
* release 1.3.2 ([fc96068](https://github.com/admilkjs/sse-dg-lab/commit/fc960689d958a1723971ff4cbf00651168c4efd9))
* release 1.3.2 ([0c7828a](https://github.com/admilkjs/sse-dg-lab/commit/0c7828a80f7589c3c5214000e65dcbe854ef1b94))
* release trigger ([dd34c75](https://github.com/admilkjs/sse-dg-lab/commit/dd34c758077e0238d549564385c5b4c50e5eb32c))
* trigger release publish ([954b738](https://github.com/admilkjs/sse-dg-lab/commit/954b738b878bc0d809bd8ee02e3c0423b61f710a))
* trigger release publish ([5a93d97](https://github.com/admilkjs/sse-dg-lab/commit/5a93d975b17d368f0e28886d144a8ed5cd2a1950))
* trigger release publish ([b732338](https://github.com/admilkjs/sse-dg-lab/commit/b7323383ba6b79aa324fe96f293be4276a1e9d97))
* 发布 v1.0.1 ([1142689](https://github.com/admilkjs/sse-dg-lab/commit/114268953cbf1d55a002c752c6ff02e8dbc77e6e))


### ♻️ 代码重构

* convert all comments to TSDoc format with Chinese ([563569e](https://github.com/admilkjs/sse-dg-lab/commit/563569e08f948560cf0e8de842d23ddc0a582482))
* 重构应用架构，新增应用初始化模块 ([a62b208](https://github.com/admilkjs/sse-dg-lab/commit/a62b208e961b37245f57ab839bc2e26fd15860b3))


### 🎡 持续集成

* OIDC ([82f1d0e](https://github.com/admilkjs/sse-dg-lab/commit/82f1d0ef973d90ad3bb5378ff95112a4b550f50f))
* 发布 ([d311b2d](https://github.com/admilkjs/sse-dg-lab/commit/d311b2d66cef78549219ff3649f2ef9c3ed3d4d9))

## [1.2.0](https://github.com/admilkjs/sse-dg-lab/compare/v1.1.0...v1.2.0) (2026-01-15)


### ✨ 新功能

* 优化波形工具、修复持续播放时序和控制器断开重连 ([801e439](https://github.com/admilkjs/sse-dg-lab/commit/801e439d1298eca5a1ff5475141e9757d5a35edd))
* 支持更多mcp协议，完善调用 ([d23c2b2](https://github.com/admilkjs/sse-dg-lab/commit/d23c2b20fe96ea298330002a6b49d7e41b774695))


### 🐛 错误修复

* 修复 npm 自动发布工作流 ([6d1dcd5](https://github.com/admilkjs/sse-dg-lab/commit/6d1dcd5840cabc82291cc0fe9ec0ea1504571031))
* 升级 Node.js 到 24.x 以支持 npm OIDC 可信发布 ([e164a68](https://github.com/admilkjs/sse-dg-lab/commit/e164a681aaaa9d0062c962c2fb4735738ba93a34))
* 暂时移除工作流中的 typecheck 步骤 ([dab92d3](https://github.com/admilkjs/sse-dg-lab/commit/dab92d377e13aafff86167e5833939b43c488f7d))
* 添加 ESLint 9 配置文件 ([7301621](https://github.com/admilkjs/sse-dg-lab/commit/73016213881febeaf48b36f7ad9e2345d96ad0d5))
* 移除工作流中的 working-directory 配置 ([21e4ae1](https://github.com/admilkjs/sse-dg-lab/commit/21e4ae18a43fc9576e0eaa7443981043948ad723))


### 🔧 其他更新

* release 1.1.0 ([3c12d8d](https://github.com/admilkjs/sse-dg-lab/commit/3c12d8d74439d1037ca047bf16e72f36cf492619))
* release 1.1.0 ([84f7497](https://github.com/admilkjs/sse-dg-lab/commit/84f7497673e90f781705e4695960f7eb316624d9))
* release 1.1.1 ([22b9e3d](https://github.com/admilkjs/sse-dg-lab/commit/22b9e3d518c1f6fd0934755fbffca47c586bf5fb))
* release 1.1.1 ([1db74a7](https://github.com/admilkjs/sse-dg-lab/commit/1db74a7436278fac93bfaed17f322c50e36b357a))
* release 1.1.1 ([37e4dc0](https://github.com/admilkjs/sse-dg-lab/commit/37e4dc0112b7f4d759b53b9996b46d7ef978aaf7))
* release 1.1.1 ([0e2ec37](https://github.com/admilkjs/sse-dg-lab/commit/0e2ec3717c13ff1cc410f80899b727ddd74bf0cf))
* release 1.1.2 ([5249305](https://github.com/admilkjs/sse-dg-lab/commit/524930522c78dd6c3129df11362291471e7d3885))
* release 1.1.2 ([838a72f](https://github.com/admilkjs/sse-dg-lab/commit/838a72f5467c703a9adc1069a8163fc8a623b160))
* release 1.1.3 ([7a38535](https://github.com/admilkjs/sse-dg-lab/commit/7a385358335dbc448d919b32d18c4a7040bc403a))
* release 1.1.3 ([0d45e8d](https://github.com/admilkjs/sse-dg-lab/commit/0d45e8daff43b66a61635065750f12275072e636))
* release 1.2.0 ([e21469f](https://github.com/admilkjs/sse-dg-lab/commit/e21469f153ff0a307e81897148fc2670a3920056))
* release 1.2.0 ([7b3445d](https://github.com/admilkjs/sse-dg-lab/commit/7b3445d9968954cd9a0eab061df3899d724f062b))
* release 1.3.0 ([d4a38e4](https://github.com/admilkjs/sse-dg-lab/commit/d4a38e49109f6f9bea9f3d3c62312194d570a648))
* release 1.3.0 ([9a0ed42](https://github.com/admilkjs/sse-dg-lab/commit/9a0ed422fc5bb52943f0d8611f5c0d9d053dfc43))
* release 1.3.1 ([3945304](https://github.com/admilkjs/sse-dg-lab/commit/39453048c353b60477f77d184cd575bbbb413f99))
* release 1.3.1 ([f36d104](https://github.com/admilkjs/sse-dg-lab/commit/f36d10472f5e1ab60e576b2a87367c2a9d37c2d0))
* release 1.3.2 ([fc96068](https://github.com/admilkjs/sse-dg-lab/commit/fc960689d958a1723971ff4cbf00651168c4efd9))
* release 1.3.2 ([0c7828a](https://github.com/admilkjs/sse-dg-lab/commit/0c7828a80f7589c3c5214000e65dcbe854ef1b94))
* release trigger ([dd34c75](https://github.com/admilkjs/sse-dg-lab/commit/dd34c758077e0238d549564385c5b4c50e5eb32c))
* trigger release publish ([954b738](https://github.com/admilkjs/sse-dg-lab/commit/954b738b878bc0d809bd8ee02e3c0423b61f710a))
* trigger release publish ([5a93d97](https://github.com/admilkjs/sse-dg-lab/commit/5a93d975b17d368f0e28886d144a8ed5cd2a1950))
* trigger release publish ([b732338](https://github.com/admilkjs/sse-dg-lab/commit/b7323383ba6b79aa324fe96f293be4276a1e9d97))


### 🎡 持续集成

* OIDC ([82f1d0e](https://github.com/admilkjs/sse-dg-lab/commit/82f1d0ef973d90ad3bb5378ff95112a4b550f50f))

## [1.1.0](https://github.com/admilkjs/sse-dg-lab/compare/v1.0.0...v1.1.0) (2026-01-15)


### ✨ 新功能

* Postman style test page with dynamic tool list ([2865135](https://github.com/admilkjs/sse-dg-lab/commit/2865135c24c3f0436c4f56167312b29f57c82dce))
* **waveform-parser:** 修复波形解析器 ([ca75d6d](https://github.com/admilkjs/sse-dg-lab/commit/ca75d6d127e0e6d512870b9af38efe2727faa9f0))
* 优化波形工具、修复持续播放时序和控制器断开重连 ([801e439](https://github.com/admilkjs/sse-dg-lab/commit/801e439d1298eca5a1ff5475141e9757d5a35edd))
* 支持更多mcp协议，完善调用 ([d23c2b2](https://github.com/admilkjs/sse-dg-lab/commit/d23c2b20fe96ea298330002a6b49d7e41b774695))
* 添加 npm publish 和 npx 支持 ([ebf6378](https://github.com/admilkjs/sse-dg-lab/commit/ebf6378007704b936d600128a90469c88afd5908))
* 添加设备重连超时功能并移除 ws-bridge 模块 ([026f788](https://github.com/admilkjs/sse-dg-lab/commit/026f788ce840976c6a029b7bc3614cd67b98d3e8))


### 🐛 错误修复

* exit ([826cdab](https://github.com/admilkjs/sse-dg-lab/commit/826cdab141b40b341460d44e3bbaeacd1fbc04e7))
* waves ([66c2656](https://github.com/admilkjs/sse-dg-lab/commit/66c2656b7d64bca81d59bddbd418012e9d884405))
* 修复 npm 自动发布工作流 ([6d1dcd5](https://github.com/admilkjs/sse-dg-lab/commit/6d1dcd5840cabc82291cc0fe9ec0ea1504571031))
* 暂时移除工作流中的 typecheck 步骤 ([dab92d3](https://github.com/admilkjs/sse-dg-lab/commit/dab92d377e13aafff86167e5833939b43c488f7d))
* 添加 ESLint 9 配置文件 ([7301621](https://github.com/admilkjs/sse-dg-lab/commit/73016213881febeaf48b36f7ad9e2345d96ad0d5))
* 移除工作流中的 working-directory 配置 ([21e4ae1](https://github.com/admilkjs/sse-dg-lab/commit/21e4ae18a43fc9576e0eaa7443981043948ad723))


### 📝 文档更新

* 添加 DG-LAB 开源协议声明 ([dc3d610](https://github.com/admilkjs/sse-dg-lab/commit/dc3d6104a4d333254dddac2cdc6ffc09eabfff20))
* 添加 v1.0.0 发布说明 ([0337a49](https://github.com/admilkjs/sse-dg-lab/commit/0337a490720e4bec405aee73fab86398fb577381))


### 🔧 其他更新

* release 1.1.0 ([3645b53](https://github.com/admilkjs/sse-dg-lab/commit/3645b534369f506ab318ccf99e29cfa1677685d8))
* release 1.1.0 ([fcf18fb](https://github.com/admilkjs/sse-dg-lab/commit/fcf18fba677d7126e9b3a0646e39876263808992))
* release 1.1.1 ([22b9e3d](https://github.com/admilkjs/sse-dg-lab/commit/22b9e3d518c1f6fd0934755fbffca47c586bf5fb))
* release 1.1.1 ([1db74a7](https://github.com/admilkjs/sse-dg-lab/commit/1db74a7436278fac93bfaed17f322c50e36b357a))
* release 1.1.1 ([37e4dc0](https://github.com/admilkjs/sse-dg-lab/commit/37e4dc0112b7f4d759b53b9996b46d7ef978aaf7))
* release 1.1.1 ([0e2ec37](https://github.com/admilkjs/sse-dg-lab/commit/0e2ec3717c13ff1cc410f80899b727ddd74bf0cf))
* release 1.1.2 ([5249305](https://github.com/admilkjs/sse-dg-lab/commit/524930522c78dd6c3129df11362291471e7d3885))
* release 1.1.2 ([838a72f](https://github.com/admilkjs/sse-dg-lab/commit/838a72f5467c703a9adc1069a8163fc8a623b160))
* release 1.1.3 ([7a38535](https://github.com/admilkjs/sse-dg-lab/commit/7a385358335dbc448d919b32d18c4a7040bc403a))
* release 1.1.3 ([0d45e8d](https://github.com/admilkjs/sse-dg-lab/commit/0d45e8daff43b66a61635065750f12275072e636))
* release 1.2.0 ([e21469f](https://github.com/admilkjs/sse-dg-lab/commit/e21469f153ff0a307e81897148fc2670a3920056))
* release 1.2.0 ([7b3445d](https://github.com/admilkjs/sse-dg-lab/commit/7b3445d9968954cd9a0eab061df3899d724f062b))
* release 1.3.0 ([d4a38e4](https://github.com/admilkjs/sse-dg-lab/commit/d4a38e49109f6f9bea9f3d3c62312194d570a648))
* release 1.3.0 ([9a0ed42](https://github.com/admilkjs/sse-dg-lab/commit/9a0ed422fc5bb52943f0d8611f5c0d9d053dfc43))
* release 1.3.1 ([3945304](https://github.com/admilkjs/sse-dg-lab/commit/39453048c353b60477f77d184cd575bbbb413f99))
* release 1.3.1 ([f36d104](https://github.com/admilkjs/sse-dg-lab/commit/f36d10472f5e1ab60e576b2a87367c2a9d37c2d0))
* release 1.3.2 ([fc96068](https://github.com/admilkjs/sse-dg-lab/commit/fc960689d958a1723971ff4cbf00651168c4efd9))
* release 1.3.2 ([0c7828a](https://github.com/admilkjs/sse-dg-lab/commit/0c7828a80f7589c3c5214000e65dcbe854ef1b94))
* release trigger ([dd34c75](https://github.com/admilkjs/sse-dg-lab/commit/dd34c758077e0238d549564385c5b4c50e5eb32c))
* trigger release publish ([954b738](https://github.com/admilkjs/sse-dg-lab/commit/954b738b878bc0d809bd8ee02e3c0423b61f710a))
* trigger release publish ([5a93d97](https://github.com/admilkjs/sse-dg-lab/commit/5a93d975b17d368f0e28886d144a8ed5cd2a1950))
* trigger release publish ([b732338](https://github.com/admilkjs/sse-dg-lab/commit/b7323383ba6b79aa324fe96f293be4276a1e9d97))
* 发布 v1.0.1 ([1142689](https://github.com/admilkjs/sse-dg-lab/commit/114268953cbf1d55a002c752c6ff02e8dbc77e6e))


### ♻️ 代码重构

* convert all comments to TSDoc format with Chinese ([563569e](https://github.com/admilkjs/sse-dg-lab/commit/563569e08f948560cf0e8de842d23ddc0a582482))
* 重构应用架构，新增应用初始化模块 ([a62b208](https://github.com/admilkjs/sse-dg-lab/commit/a62b208e961b37245f57ab839bc2e26fd15860b3))


### 🎡 持续集成

* OIDC ([82f1d0e](https://github.com/admilkjs/sse-dg-lab/commit/82f1d0ef973d90ad3bb5378ff95112a4b550f50f))

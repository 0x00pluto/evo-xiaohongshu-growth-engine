#!/usr/bin/env node
// @ts-check
'use strict';

// 插件中心的包不含 scripts/。可执行脚本在 src/xhs-note/，这里只保留旧入口。
require('../src/xhs-note/dexbuddy-native-host.js');

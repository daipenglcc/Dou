/**
 * 各平台示例分享链接配置
 * 供 GET /api/examples 接口与每日解析自检任务共用
 */
const EXAMPLE_LINKS = [
	{
		platform: 'douyin',
		platformName: '抖音',
		type: 'video',
		label: '抖音视频示例',
		text: '2.00 复制打开抖音，看看【绿肥红的作品】你的社交动态不再更新了 我该从哪里了解你的现状  https://v.douyin.com/F_MnkKBlxaE/ :7pm 07/10 wfo:/ v@f.BG'
	},
	{
		platform: 'douyin',
		platformName: '抖音',
		type: 'image',
		label: '抖音图片示例',
		text: '0.74 复制打开抖音，看看【予卿繁.的图文作品】黑色背景图评论区自取。# 如果这个宇宙的结局是注定... https://v.douyin.com/TpT3OXPGd4w/ E@H.ip :2pm Cuf:/ 06/11'
	},
	{
		platform: 'xiaohongshu',
		platformName: '小红书',
		type: 'video',
		label: '小红书视频示例',
		text: '模特的无痕内衣选择？舒适塑形不突兀 夏天小透衫的救... https://xhslink.cn/o/3OL9bl6jCKY 保留口令，直达【小红书】围观~'
	},
	{
		platform: 'xiaohongshu',
		platformName: '小红书',
		type: 'image',
		label: '小红书图片示例',
		text: '就这样萌萌的看着你呀 小比格 https://xhslink.cn/o/4twzQsvcpLk 【小红书】里有精彩内容，快去瞧瞧！'
	},
	{
		platform: 'kuaishou',
		platformName: '快手',
		type: 'video',
		label: '快手视频示例',
		text: 'https://v.kuaishou.com/nLHP9uAF "喜爱度激励计划 "跨次元应援中国队 "微胖 "换装 该作品在快手被播放过46.7万次，点击链接，打开【快手】直接观看！'
	},
	{
		platform: 'kuaishou',
		platformName: '快手',
		type: 'image',
		label: '快手图片示例',
		text: 'https://v.kuaishou.com/JZKPUPxy 眉目伊始 可爱如斯 该作品在快手被播放过1719次，点击链接，打开【快手】直接观看！'
	},
	{
		platform: 'bilibili',
		platformName: '哔哩哔哩',
		type: 'video',
		label: '哔哩哔哩视频示例',
		text: '【落花情-哔哩哔哩】 https://b23.tv/BV1NUnR6DEBT'
	},
	{
		platform: 'toutiao',
		platformName: '今日头条',
		type: 'video',
		label: '今日头条视频示例',
		text: '【我感觉他说得好像没问题，但又总觉得哪里不太对……】点击链接打开👉 https://m.toutiao.com/is/NcSYy5s7pEI/'
	}
]

module.exports = { EXAMPLE_LINKS }

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
		text: '0.05 复制打开抖音，看看【逐花归海.的作品】“我对流星许愿,希望你永远快乐·” ᴵ ʷⁱˢʰ ... https://v.douyin.com/ab9ZPlJQMuo/ e@O.xs :8pm uSL:/ 11/07 '
	},
	{
		platform: 'douyin',
		platformName: '抖音',
		type: 'image',
		label: '抖音图片示例',
		text: '6.15 复制打开抖音，看看【雪加鸭嘴兽大板砖积木的图文作品】值得长期不换的壁纸# 蓝猫图库 # 手机墙纸 # ... https://v.douyin.com/g5-Y27aXErc/ 01/15 kca:/ B@G.iP :8pm '
	},
	{
		platform: 'xiaohongshu',
		platformName: '小红书',
		type: 'video',
		label: '小红书视频示例',
		text: '不结婚以后老了谁照顾你？ https://xhslink.cn/o/3kg7wxaSFW7 先复制一下，打开【小红书】看看这篇好文！'
	},
	{
		platform: 'xiaohongshu',
		platformName: '小红书',
		type: 'image',
		label: '小红书图片示例',
		text: '“ios27 https://xhslink.cn/o/1biSEj1qpIB 复制后直接打开【小红书】，笔记就在那里等你。'
	},
	{
		platform: 'kuaishou',
		platformName: '快手',
		type: 'video',
		label: '快手视频示例',
		text: 'https://v.kuaishou.com/JUezWDe1 260904 KBS音乐银行上班路 演出顺利！身体健康最重要！"沈佳润 "沈佳润Nina "沈佳润二专whynotme 该作品在快手被播放过314.2万次，点击链接，打开【快手】直接观看！'
	},
	{
		platform: 'kuaishou',
		platformName: '快手',
		type: 'image',
		label: '快手图片示例',
		text: 'https://v.kuaishou.com/J9dNWUsH 人与人之间的缘，像一盏忽明忽暗的灯 "氛围感女头 "遗憾头像女 "好景不常在 "久久爱意PK赛 该作品在快手被播放过15万次，点击链接，打开【快手】直接观看！'
	},
	{
		platform: 'bilibili',
		platformName: '哔哩哔哩',
		type: 'video',
		label: '哔哩哔哩视频示例',
		text: '【【LCK女团】《Whiplash》视觉盛宴-哔哩哔哩】 https://b23.tv/CXsCLfp'
	},
	{
		platform: 'toutiao',
		platformName: '今日头条',
		type: 'video',
		label: '今日头条视频示例',
		text: '【立冬北京下雪啦~~还蛮美丽冻人的~~那就就骗我一次一下叭~~貌似超适合...】 点击链接打开👉 https://m.toutiao.com/is/NxDNuRHwULU/ NxDNuRHwULU` Axw:/ q@e.Ox :2am 复制此条消息，打开「今日头条APP」或「今日头条极速版APP」后直接查看~'
	}
]

module.exports = { EXAMPLE_LINKS }

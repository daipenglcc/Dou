module.exports = {
	apps: [
		{
			name: 'douyin',
			script: 'npm',
			args: 'run dev',
			watch: true,
			env: {
				NODE_ENV: 'development'
			}
		}
	]
}

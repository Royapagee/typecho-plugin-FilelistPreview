<?php

namespace TypechoPlugin\FilelistPreview;

use Typecho\Plugin\PluginInterface;
use Typecho\Widget\Helper\Form;
use Widget\Options;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 后台附件列表图片预览
 *
 * 在附件的上传面板中，为图片附件生成缩略图预览，便于上传后快速确认图片内容。
 *
 * @package FilelistPreview
 * @author 罗伊
 * @version 1.0.0
 * @link https://blog.roysgensokyo.space/
 */
class Plugin implements PluginInterface
{
    /**
     * 需要注入资源的后台页面
     */
    private const PAGES = ['write-post.php', 'write-page.php', 'media.php'];

    /**
     * 默认预览高度（像素）
     */
    private const DEFAULT_HEIGHT = 120;

    /**
     * 预览高度允许的范围
     */
    private const MIN_HEIGHT = 60;
    private const MAX_HEIGHT = 400;

    /**
     * 激活插件方法
     */
    public static function activate()
    {
        \Typecho\Plugin::factory('admin/footer.php')->end = __CLASS__ . '::render';
    }

    /**
     * 禁用插件方法
     */
    public static function deactivate()
    {
    }

    /**
     * 获取插件配置面板
     *
     * @param Form $form
     */
    public static function config(Form $form)
    {
        $height = new Form\Element\Text(
            'thumbHeight',
            null,
            (string) self::DEFAULT_HEIGHT,
            _t('预览高度'),
            _t('缩略图的高度，单位为像素，可填 %d ~ %d，默认 %d。宽度会随上传面板自动铺满。',
                self::MIN_HEIGHT, self::MAX_HEIGHT, self::DEFAULT_HEIGHT)
        );
        $height->addRule('isInteger', _t('请填入一个数字'));
        $form->addInput($height);

        $lightbox = new Form\Element\Radio(
            'lightbox',
            [
                '1' => _t('点击后在当前页放大查看'),
                '0' => _t('点击后在新标签页打开原图'),
            ],
            '1',
            _t('查看大图'),
            _t('缩略图始终显示在文件名上方，这里只控制点击缩略图后的行为。')
        );
        $form->addInput($lightbox);
    }

    /**
     * 个人用户的配置面板
     *
     * @param Form $form
     */
    public static function personalConfig(Form $form)
    {
    }

    /**
     * 读取设置；尚未保存过插件设置时使用默认值
     *
     * @return array{thumbHeight: int, lightbox: bool}
     */
    private static function getConfig(): array
    {
        $height = self::DEFAULT_HEIGHT;
        $lightbox = true;

        try {
            $config = Options::alloc()->plugin('FilelistPreview');
            $savedHeight = (int) $config->thumbHeight;

            if ($savedHeight > 0) {
                $height = $savedHeight;
            }

            $lightbox = (string) $config->lightbox !== '0';
        } catch (\Typecho\Plugin\Exception $e) {
            // 从未保存过设置时沿用默认值
        }

        return [
            'thumbHeight' => max(self::MIN_HEIGHT, min(self::MAX_HEIGHT, $height)),
            'lightbox' => $lightbox,
        ];
    }

    /**
     * 静态资源版本号，按文件修改时间生成，避免改完资源后浏览器仍用缓存
     *
     * @param string $file
     * @return string
     */
    private static function assetVersion(string $file): string
    {
        $time = @filemtime($file);

        return $time ? (string) $time : '1.0.0';
    }

    /**
     * 在带上传面板的后台页面底部注入预览资源
     *
     * @access public
     * @return void
     */
    public static function render()
    {
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');

        if (!in_array(basename($script), self::PAGES, true)) {
            return;
        }

        $options = Options::alloc();
        $config = self::getConfig();

        $cssUrl = \Typecho\Common::url(
            'FilelistPreview/static/filelistpreview.css',
            $options->pluginUrl
        );
        $jsUrl = \Typecho\Common::url(
            'FilelistPreview/static/filelistpreview.js',
            $options->pluginUrl
        );
        $cssUrl .= '?v=' . self::assetVersion(__DIR__ . '/static/filelistpreview.css');
        $jsUrl .= '?v=' . self::assetVersion(__DIR__ . '/static/filelistpreview.js');

        echo '<link rel="stylesheet" href="' . htmlspecialchars($cssUrl) . '" />' . "\n";
        echo '<script>window.FLP_CONFIG = ' . json_encode(
            $config,
            JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        ) . ';</script>' . "\n";
        echo '<script src="' . htmlspecialchars($jsUrl) . '"></script>' . "\n";
    }
}

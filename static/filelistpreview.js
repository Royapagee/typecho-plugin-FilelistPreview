/**
 * FilelistPreview - Typecho 后台附件列表图片预览
 *
 * 在 #upload-panel 的 #file-list 中，为图片附件在文件名上方插入缩略图。
 * 同时兼容服务端渲染的已有附件和上传完成后由 file-upload-js.php 动态插入的条目。
 */
(function () {
    'use strict';

    if (typeof window.jQuery === 'undefined') {
        return;
    }

    var $ = window.jQuery;
    var config = window.FLP_CONFIG || {};
    var thumbHeight = parseInt(config.thumbHeight, 10);
    var lightboxEnabled = !(
        config.lightbox === false ||
        config.lightbox === 0 ||
        config.lightbox === '0'
    );

    if (!(thumbHeight > 0)) {
        thumbHeight = 120;
    }

    var list = null;
    var lightbox = null;
    var lightboxImage = null;
    var lightboxClose = null;
    var lastFocus = null;

    /**
     * 读取条目的图片地址；非图片或没有地址时返回 null
     *
     * 新上传的条目用 jQuery .data() 写入地址，不会同步到 data-* 属性，
     * 所以这里统一走 .data() 读取。
     */
    function imageUrl(li) {
        var $li = $(li);
        var image = $li.data('image');

        if (image === true) {
            image = 1;
        }

        if (Number(image) !== 1) {
            return null;
        }

        var url = $li.data('url');

        return typeof url === 'string' && url !== '' ? url : null;
    }

    /**
     * 设置图片地址，并在加载成功 / 失败时更新缩略图状态
     *
     * 加载时机交给浏览器原生的 loading="lazy"：附件面板位于隐藏标签页时
     * 不会请求原图，切换到“附件”标签后再按需加载。
     */
    function setImageSource(img, url) {
        img.addEventListener('load', function () {
            var link = img.parentNode;

            if (link) {
                link.classList.add('is-loaded');
            }
        });

        img.addEventListener('error', function () {
            var link = img.parentNode;

            if (link && link.parentNode) {
                link.parentNode.removeChild(link);
            }
        });

        img.src = url;
    }

    /**
     * 为单个附件条目补充缩略图
     */
    function enhance(li) {
        if (!li || li.nodeName !== 'LI' || !li.parentNode || li.parentNode !== list) {
            return;
        }

        if (li.classList.contains('loading') || li.querySelector('.flp-thumb')) {
            return;
        }

        var url = imageUrl(li);

        if (!url) {
            return;
        }

        var insert = li.querySelector('a.insert');
        var title = insert ? $.trim($(insert).text()) : '';

        var link = document.createElement('a');
        link.className = 'flp-thumb';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = '点击查看原图';
        link.setAttribute('aria-label', title ? '预览图片：' + title : '预览图片');

        var img = document.createElement('img');
        img.alt = title;
        img.decoding = 'async';
        img.loading = 'lazy';

        link.appendChild(img);

        if (lightboxEnabled) {
            link.addEventListener('click', function (event) {
                // 保留按住 Ctrl / Cmd 等键时“在新标签页打开”的原生行为
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                }

                event.preventDefault();
                openLightbox(url, title);
            });
        }

        setImageSource(img, url);

        li.insertBefore(link, li.firstChild);
    }

    /**
     * 监听文件列表变化，给新上传或刚完成上传的条目补充缩略图
     */
    function observe() {
        if (typeof MutationObserver === 'undefined') {
            return;
        }

        var mutationObserver = new MutationObserver(function (mutations) {
            var touched = [];

            function queue(li) {
                if (touched.indexOf(li) < 0) {
                    touched.push(li);
                }
            }

            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList') {
                    // 上传完成后 file-upload-js.php 会重写 li 的 innerHTML
                    if (mutation.target.nodeName === 'LI') {
                        queue(mutation.target);
                    }

                    for (var i = 0; i < mutation.addedNodes.length; i++) {
                        var node = mutation.addedNodes[i];

                        if (node.nodeType !== 1) {
                            continue;
                        }

                        if (node.nodeName === 'LI') {
                            queue(node);
                        } else if (node.querySelectorAll) {
                            var nested = node.querySelectorAll('li');

                            for (var j = 0; j < nested.length; j++) {
                                queue(nested[j]);
                            }
                        }
                    }
                } else if (mutation.type === 'attributes' && mutation.target.nodeName === 'LI') {
                    queue(mutation.target);
                }
            });

            for (var k = 0; k < touched.length; k++) {
                enhance(touched[k]);
            }
        });

        mutationObserver.observe(list, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    /**
     * 创建查看大图的浮层（只创建一次）
     */
    function ensureLightbox() {
        if (lightbox) {
            return;
        }

        lightbox = document.createElement('div');
        lightbox.className = 'flp-lightbox';
        lightbox.hidden = true;
        lightbox.setAttribute('role', 'dialog');
        lightbox.setAttribute('aria-modal', 'true');
        lightbox.setAttribute('aria-label', '图片预览');

        lightboxImage = document.createElement('img');
        lightboxImage.className = 'flp-lightbox__image';
        lightboxImage.alt = '';

        lightboxClose = document.createElement('button');
        lightboxClose.type = 'button';
        lightboxClose.className = 'flp-lightbox__close';
        lightboxClose.title = '关闭';
        lightboxClose.setAttribute('aria-label', '关闭');
        lightboxClose.innerHTML = '&times;';

        lightbox.appendChild(lightboxImage);
        lightbox.appendChild(lightboxClose);
        document.body.appendChild(lightbox);

        lightboxClose.addEventListener('click', function (event) {
            event.preventDefault();
            closeLightbox();
        });

        lightbox.addEventListener('click', function (event) {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (lightbox.hidden) {
                return;
            }

            if (event.key === 'Escape' || event.keyCode === 27) {
                closeLightbox();
            }
        });
    }

    function openLightbox(url, title) {
        ensureLightbox();

        lastFocus = document.activeElement;
        lightboxImage.src = url;
        lightboxImage.alt = title || '';
        lightbox.hidden = false;
        document.documentElement.classList.add('flp-lightbox-open');
        lightboxClose.focus();
    }

    function closeLightbox() {
        if (!lightbox || lightbox.hidden) {
            return;
        }

        lightbox.hidden = true;
        lightboxImage.removeAttribute('src');
        lightboxImage.alt = '';
        document.documentElement.classList.remove('flp-lightbox-open');

        if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }

        lastFocus = null;
    }

    /**
     * 初始化：处理已有条目并开始监听列表变化
     */
    function init() {
        list = document.getElementById('file-list');

        if (!list) {
            return;
        }

        list.style.setProperty('--flp-thumb-height', thumbHeight + 'px');

        for (var i = 0; i < list.children.length; i++) {
            if (list.children[i].nodeName === 'LI') {
                enhance(list.children[i]);
            }
        }

        observe();
    }

    $(function () {
        init();
    });
})();

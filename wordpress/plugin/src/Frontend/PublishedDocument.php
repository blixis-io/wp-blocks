<?php
/**
 * A published document ready to render.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** The merged layout and locale content of one published revision pair. */
final class PublishedDocument {
	/**
	 * Create a value.
	 *
	 * @param \stdClass $document Layout merged with the locale translations.
	 * @param string    $locale Locale whose content was selected.
	 * @param int       $layout_revision Published layout snapshot number.
	 * @param int       $content_revision Content snapshot number, or 0 when none applies.
	 */
	public function __construct(
		public readonly \stdClass $document,
		public readonly string $locale,
		public readonly int $layout_revision,
		public readonly int $content_revision
	) {}
}

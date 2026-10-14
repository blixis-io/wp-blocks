<?php
/**
 * What a publish or rollback should do.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** Immutable request: which parts to publish, from which source, and how to treat incompatible content. */
final class PublishOptions {
	/**
	 * Create options.
	 *
	 * @param int     $expected_pointer_revision Pointer revision the caller saw (0 when never published).
	 * @param bool    $layout Publish the layout.
	 * @param ?string $locale Locale whose content to publish.
	 * @param bool    $confirm_impact Accept that incompatible locales stay pinned to their previous layout.
	 * @param bool    $exclude_incompatible Drop content entries that do not fit the layout instead of blocking.
	 * @param ?int    $layout_snapshot Roll back: republish this layout snapshot instead of the working layout.
	 * @param ?int    $content_snapshot Roll back: republish this content snapshot (with its layout) of the locale.
	 * @param string  $default_locale Site default locale, recorded the first time.
	 */
	public function __construct(
		public readonly int $expected_pointer_revision,
		public readonly bool $layout = false,
		public readonly ?string $locale = null,
		public readonly bool $confirm_impact = false,
		public readonly bool $exclude_incompatible = false,
		public readonly ?int $layout_snapshot = null,
		public readonly ?int $content_snapshot = null,
		public readonly string $default_locale = 'en_US'
	) {}
}

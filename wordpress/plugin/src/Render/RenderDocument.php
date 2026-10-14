<?php
/** Separate persisted layout and content streams.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Merges selected locale stream entries into the renderer's envelope view. */
final class RenderDocument {
	/**
	 * Apply the documented contract.
	 *
	 * @param \stdClass                $layout Layout.
	 * @param array<string, \stdClass> $content_by_locale Content by locale.
	 */
	public static function from_streams( \stdClass $layout, array $content_by_locale ): \stdClass {
		$merged       = clone $layout;
		$translations = ( $merged->translations ?? null ) instanceof \stdClass ? clone $merged->translations : new \stdClass();
		foreach ( $content_by_locale as $locale => $content ) {
			if ( ! \is_string( $locale ) || ! $content instanceof \stdClass ) {
				continue;
			}
			$entries = $content->entries ?? $content->translations ?? null;
			if ( $entries instanceof \stdClass ) {
				$translations->$locale = $entries;
			}
		}
		$merged->translations = $translations;
		return $merged;
	}
}

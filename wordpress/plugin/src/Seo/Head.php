<?php
/**
 * Safe SEO head output for builder documents.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Seo;

use Blixis\Builder\Frontend\DraftPreview;
use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\MetaRegistration;
use Blixis\Builder\Rest\PageSettingsRequest;
\defined( 'ABSPATH' ) || exit;

/** Emits page SEO only when no established SEO plugin owns the head. */
final class Head {
	/** Register public head hooks. */
	public static function hooks(): void {
		\add_action( 'wp_head', [ self::class,'output' ], 2 );
		\add_action( 'wp_head', [ self::class,'remove_core_canonical' ], 1 );
		\add_filter( 'wp_robots', [ self::class,'robots' ] );
		\add_filter( 'pre_get_document_title', [ self::class,'title' ] );
		\add_filter( 'document_title_parts', [ self::class,'title_parts' ] ); }
	/** Remove WordPress canonical output when this class owns the page. */
	public static function remove_core_canonical(): void {
		if ( null !== self::data() ) {
			\remove_action( 'wp_head', 'rel_canonical' );
		} }
	/** Whether this request can emit builder SEO. */
	private static function enabled(): bool {
		$active = \defined( 'WPSEO_VERSION' ) || \defined( 'RANK_MATH_VERSION' ) || \defined( 'SEOPRESS_VERSION' ) || \defined( 'AIOSEO_VERSION' );
		return (bool) \apply_filters( 'blixis_builder_seo_output', ! $active ) && ! $active && ! DraftPreview::active() && \is_singular() && ! \post_password_required(); }
	/** Read the current locale's SEO values with default-locale fallback.
	 *
	 * @return ?array<string, mixed>
	 */
	private static function data(): ?array {
		if ( ! self::enabled() ) {
			return null;
		} $id = (int) \get_queried_object_id();
		if ( $id < 1 || ! \in_array( \get_post_type( $id ), MetaRegistration::post_types(), true ) ) {
			return null;
		}
		$raw    = \get_post_meta( $id, MetaKeys::SEO, true );
		$env    = \is_string( $raw ) ? \json_decode( $raw, true ) : [];
		$map    = \is_array( $env ) && \is_array( $env['locales'] ?? null ) ? $env['locales'] : [];
		$config = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
		$locale = \get_locale();
		$item   = $map[ $locale ] ?? $map[ $config->default_locale ] ?? [];
		$item   = PageSettingsRequest::normalize_seo_read( $item );
		return [
			'id'     => $id,
			'item'   => $item,
			'post'   => \get_post( $id ),
			'locale' => $locale,
		];
	}
	/** Print escaped description, social tags and canonical URL. */
	public static function output(): void {
		$data = self::data();
		if ( null === $data ) {
			return;
		} $s         = $data['item'];
		$post        = $data['post'];
		$title       = (string) ( $s['metaTitle'] ?? '' );
		$ogtitle     = (string) ( $s['ogTitle'] ?? '' );
		$description = (string) ( $s['metaDescription'] ?? '' );
		$ogdesc      = (string) ( $s['ogDescription'] ?? '' );
		if ( '' === $description ) {
			$description = (string) $post->post_excerpt;
		} if ( '' === $ogtitle ) {
			$ogtitle = '' !== $title ? $title : (string) $post->post_title;
		} if ( '' === $ogdesc ) {
			$ogdesc = $description;
		}
		echo '<meta name="description" content="' . \esc_attr( $description ) . '">' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- value escaped above.
		echo '<meta property="og:title" content="' . \esc_attr( $ogtitle ) . '">' . "\n";
		echo '<meta property="og:description" content="' . \esc_attr( $ogdesc ) . '">' . "\n";
		echo '<meta property="og:type" content="website">' . "\n";
		$permalink = \get_permalink( $data['id'] );
		echo '<meta property="og:url" content="' . \esc_url( false === $permalink ? '' : $permalink ) . '">' . "\n";
		$image_id  = $s['ogImageId'] ?? 0;
		$has_image = false;
		if ( \is_int( $image_id ) || \ctype_digit( (string) $image_id ) ) {
			$src = \wp_get_attachment_image_src( (int) $image_id, 'full' );
			if ( \is_array( $src ) && self::same_origin( $src[0] ) ) {
				$has_image = true;
				echo '<meta property="og:image" content="' . \esc_url( $src[0] ) . '">' . "\n";
				echo '<meta property="og:image:width" content="' . (int) $src[1] . '">' . "\n";
				echo '<meta property="og:image:height" content="' . (int) $src[2] . '">' . "\n"; }
		}
		echo '<meta property="og:locale" content="' . \esc_attr( LocaleConfig::tag( $data['locale'] ) ) . '">' . "\n";
		echo '<meta name="twitter:card" content="' . ( $has_image ? 'summary_large_image' : 'summary' ) . '">' . "\n";
		$canonical = (string) ( $s['canonical'] ?? '' );
		$permalink = \get_permalink( $data['id'] );
		echo '<link rel="canonical" href="' . \esc_url( '' === $canonical ? ( false === $permalink ? '' : $permalink ) : $canonical ) . '">' . "\n";
	}
	/** Override the document title when configured.
	 *
	 * @param string $title Core document title.
	 */
	public static function title( string $title ): string {
		$d = self::data();
		return null !== $d && '' !== ( $d['item']['metaTitle'] ?? '' ) ? \esc_html( \wp_strip_all_tags( (string) $d['item']['metaTitle'] ) ) : $title; }
	/** Override the title component when configured.
	 *
	 * @param array<string, mixed> $parts Title components.
	 * @return array<string, mixed>
	 */
	public static function title_parts( array $parts ): array {
		$d = self::data();
		if ( null !== $d && '' !== ( $d['item']['metaTitle'] ?? '' ) ) {
			$parts['title'] = \wp_strip_all_tags( (string) $d['item']['metaTitle'] );
		} return $parts; }
	/** Add robots directives from page settings.
	 *
	 * @param array<string, mixed> $robots Robots directives.
	 * @return array<string, mixed>
	 */
	public static function robots( array $robots ): array {
		$d = self::data();
		if ( null === $d ) {
			return $robots;
		} if ( ! empty( $d['item']['noindex'] ) ) {
			$robots['noindex'] = true;
		} if ( ! empty( $d['item']['nofollow'] ) ) {
			$robots['nofollow'] = true;
		} return $robots; }
	/** Check that a media URL matches the home origin.
	 *
	 * @param string $url Candidate URL.
	 */
	public static function same_origin( string $url ): bool {
		$a = \wp_parse_url( $url );
		$b = \wp_parse_url( \home_url() );
		return \is_array( $a ) && \is_array( $b ) && \strtolower( (string) ( $a['scheme'] ?? '' ) ) === \strtolower( (string) ( $b['scheme'] ?? '' ) ) && \strtolower( (string) ( $a['host'] ?? '' ) ) === \strtolower( (string) ( $b['host'] ?? '' ) ) && (int) ( $a['port'] ?? 0 ) === (int) ( $b['port'] ?? 0 ); }
}

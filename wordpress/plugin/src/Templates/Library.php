<?php
/**
 * Loads bundled validated template packs.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Templates;

/** Memoised request-local template catalogue. */
final class Library {
	/**
	 * Current request's singleton.
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;
	/**
	 * Valid cards.
	 *
	 * @var list<TemplateCard>
	 */
	private array $cards = [];
	/**
	 * Invalid pack diagnostics.
	 *
	 * @var list<array{id:string,errors:list<string>}>
	 */
	private array $problems = [];
	/** Load, validate and memoise pack roots.
	 *
	 * @param array<string>|null $dirs Optional explicit roots.
	 */
	private function __construct( ?array $dirs = null ) {
		$dirs    ??= function_exists( 'apply_filters' ) ? apply_filters( 'blixis_builder_template_packs', [ dirname( __DIR__, 2 ) . '/templates/packs' ] ) : [ dirname( __DIR__, 2 ) . '/templates/packs' ];
		$validator = new TemplateValidator();
		$seen      = [];
		foreach ( is_array( $dirs ) ? $dirs : [] as $root ) {
			$directories = is_dir( $root ) ? glob( rtrim( $root, '/' ) . '/*', GLOB_ONLYDIR ) : [];
			foreach ( is_array( $directories ) ? $directories : [] as $dir ) {
				$id = basename( $dir );
				try {
					$errors = $validator->validate( $dir );
					if ( $errors ) {
						$this->problems[] = [
							'id'     => $id,
							'errors' => $errors,
						];
						continue; }
					$json = file_get_contents( $dir . '/template.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read a local bundled JSON file.
					if ( false === $json ) {
						$this->problems[] = [
							'id'     => $id,
							'errors' => [ 'template.json could not be read' ],
						];
						continue; }
					$data = json_decode( $json, true );
					if ( ! is_array( $data ) || ( $data['template']['id'] ?? '' ) !== $id ) {
						$this->problems[] = [
							'id'     => $id,
							'errors' => [ 'directory and template id differ' ],
						];
						continue; }
					if ( isset( $seen[ $id ] ) ) {
						$this->problems[] = [
							'id'     => $id,
							'errors' => [ 'duplicate template id; first valid pack wins' ],
						];
						continue; }
					$seen[ $id ] = true;
					$url_base    = self::url_base( $dir );
					$assets      = [];
					foreach ( $data['assets'] as $key => $asset ) {
						$assets[ $key ] = null !== $url_base ? rtrim( $url_base, '/' ) . '/' . str_replace( '%2F', '/', rawurlencode( $asset['source']['path'] ) ) : ''; }
					$palette = $data['designTokens']['colors'];
					$fonts   = array_map(
						static fn( $font ) => [
							'family'    => $font['family'],
							'installed' => self::installed( $font['family'] ),
						],
						$data['fonts']
					);
					if ( null === $url_base ) {
						$this->problems[] = [
							'id'     => $id,
							'errors' => [ 'pack root is outside plugin and uploads directories; asset URLs are unavailable' ],
						]; }
					$this->cards[] = new TemplateCard(
						[
							'id'          => $id,
							'name'        => $data['template']['name'],
							'category'    => $data['template']['category'],
							'description' => $data['template']['description'],
							'version'     => $data['template']['version'],
							'tags'        => $data['template']['tags'],
							'previewUrl'  => $assets['preview'] ?? '',
							'assets'      => $assets,
							'palette'     => [
								'light' => $palette['light'] ?? [],
								'dark'  => $palette['dark'] ?? [],
							],
							'fonts'       => $fonts,
							'importable'  => (bool) ( $data['documents'][0]['importable'] ?? true ),
							'reasons'     => self::reasons( $data['documents'][0]['importabilityReasons'] ?? [] ),
						],
						$dir,
						$url_base
					);
				} catch ( \Throwable $error ) {
					$this->problems[] = [
						'id'     => $id,
						'errors' => [ 'pack could not be loaded safely' ],
					]; }
			}
		}
	}
	/** Return the request-local filtered catalogue. */
	public static function instance(): self {
		return self::$instance ??= new self(); }
	/** Construct a separately memoised library for explicit pack roots.
	 *
	 * @param array<string> $dirs Pack roots.
	 * @return self New catalogue instance.
	 */
	public static function from_directories( array $dirs ): self {
		return new self( $dirs ); }
	/** Return all valid template cards.
	 *
	 * @return list<TemplateCard> Valid cards.
	 */
	public function all(): array {
		return $this->cards; }
	/** Return invalid pack diagnostics.
	 *
	 * @return list<array{id:string,errors:list<string>}> Pack errors.
	 */
	public function problems(): array {
		return $this->problems; }
	/** Find a valid pack by id.
	 *
	 * @param string $id Pack id.
	 * @return TemplateCard|null Card when found.
	 */
	public function find( string $id ): ?TemplateCard {
		foreach ( $this->cards as $card ) {
			if ( $card->data['id'] === $id ) {
				return $card;
			}
		} return null; }
	/** Return validated design tokens for a card.
	 *
	 * @param string $id Pack id.
	 * @return array<string,mixed>|null Token data when found.
	 */
	public function tokens( string $id ): ?array {
		$card = $this->find( $id );
		if ( ! $card ) {
			return null;
		} $file = $card->directory . '/template.json';
		$json   = file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read a local validated pack.
		if ( false === $json ) {
			return null; }
		$d = json_decode( $json, true );
		return $d['designTokens'] ?? null; }
	/** Check whether a family post already exists.
	 *
	 * @param string $family Display family name.
	 * @return bool Whether it is installed.
	 */
	private static function installed( string $family ): bool {
		if ( ! function_exists( 'get_posts' ) ) {
			return false;
		} $slug = [
			'Plus Jakarta Sans' => 'plus-jakarta-sans',
			'Inter'             => 'inter',
			'Space Grotesk'     => 'space-grotesk',
			'DM Sans'           => 'dm-sans',
			'Manrope'           => 'manrope',
			'Outfit'            => 'outfit',
		][ $family ] ?? '';
		if ( '' === $slug ) {
			return false; }
		$posts = get_posts(
			[
				'post_type'   => 'wp_font_family',
				'post_status' => 'publish',
				'name'        => $slug,
				'numberposts' => 1,
			]
		);
		return isset( $posts[0] ) && ( $posts[0]->post_name ?? '' ) === $slug;
	}

	/** Convert a pack directory to a URL only for trusted plugin or uploads roots.
	 *
	 * @param string $directory Pack directory.
	 * @return ?string Trusted URL base.
	 */
	private static function url_base( string $directory ): ?string {
		$real        = realpath( $directory );
		$plugin_root = realpath( dirname( __DIR__, 2 ) );
		if ( false !== $real && false !== $plugin_root && str_starts_with( $real, $plugin_root . DIRECTORY_SEPARATOR ) ) {
			$relative = ltrim( substr( $real, strlen( $plugin_root ) ), DIRECTORY_SEPARATOR );
			return plugins_url( str_replace( DIRECTORY_SEPARATOR, '/', $relative ), dirname( __DIR__, 2 ) . '/blixis-builder.php' ); }
		if ( function_exists( 'wp_upload_dir' ) ) {
			$uploads = wp_upload_dir();
			$base    = realpath( $uploads['basedir'] ?? '' );
			if ( false !== $real && false !== $base && str_starts_with( $real, $base . DIRECTORY_SEPARATOR ) ) {
				return rtrim( $uploads['baseurl'], '/' ) . '/' . str_replace( DIRECTORY_SEPARATOR, '/', ltrim( substr( $real, strlen( $base ) ), DIRECTORY_SEPARATOR ) ); }
		}
		return null;
	}

	/**
	 * Bounded, plain-text importability reasons for the admin catalogue.
	 *
	 * @param mixed $reasons Validated reasons from the pack.
	 * @return list<string>
	 */
	private static function reasons( mixed $reasons ): array {
		if ( ! \is_array( $reasons ) ) {
			return [];
		}
		$out = [];
		foreach ( \array_slice( $reasons, 0, 100 ) as $reason ) {
			if ( \is_string( $reason ) ) {
				$out[] = \mb_substr( \trim( (string) \preg_replace( '/<[^>]*>/', '', $reason ) ), 0, 200 );
			}
		}
		return $out;
	}
}
